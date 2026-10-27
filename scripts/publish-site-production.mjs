import {fileURLToPath} from 'node:url';
import {appendFile} from 'node:fs/promises';
import {siteProduction as policy, validRevision, assertProductionDeployment} from '../site/scripts/production-policy.mjs';

export function jsonApi(origin, token, fetcher = fetch) {
  return async (path, body) => {
    const url = new URL(path, origin);
    if (url.origin !== origin) throw Error('Release API origin cannot change.');
    if (origin === 'https://api.vercel.com') url.searchParams.set('teamId',policy.teamId);
    const response = await fetcher(url, {
      method:body === undefined ? 'GET' : 'POST', redirect:'error', signal:AbortSignal.timeout(20000),
      headers:{authorization:`Bearer ${token}`,accept:'application/json','cache-control':'no-cache',...(body===undefined?{}:{'content-type':'application/json'})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
    });
    // Provider responses may include request or credential details. Never log them.
    if (!response.ok) throw Error(`Release API request failed (${response.status}, ${url.pathname}).`);
    return response.json();
  };
}

export async function publishSite({revision, github, vercel, liveInfo, wait = ms => new Promise(resolve=>setTimeout(resolve,ms)), attempts = 24}) {
  if (!validRevision(revision)) throw Error('A full main commit SHA is required.');
  const repo = `/repos/${policy.repository}`;
  async function currentMain() {
    const current = (await github(`${repo}/git/ref/heads/main`)).object?.sha;
    if (current !== revision) throw Error('Release superseded: candidate is not current main. No domain was changed.');
  }
  await currentMain();
  const project = await vercel(`/v9/projects/${policy.projectId}`);
  if (project.autoAssignCustomDomains !== false || project.link?.productionBranch !== 'main'
    || `${project.link?.org}/${project.link?.repo}` !== policy.repository) {
    throw Error('Release protection is not enabled: require main and disable automatic domain assignment.');
  }
  const runs = (await github(`${repo}/actions/workflows/ci.yml/runs?branch=main&event=push&head_sha=${revision}&status=completed&per_page=10`)).workflow_runs ?? [];
  if (!runs.some(run => run.head_sha === revision && run.head_branch === 'main' && run.event === 'push'
    && run.status === 'completed' && run.conclusion === 'success'
    && run.head_repository?.full_name === policy.repository)) throw Error('CI has not passed for this exact main revision.');

  let deployment;
  for (let attempt=0;attempt<attempts;attempt++) {
    await currentMain();
    const list = (await vercel(`/v6/deployments?projectId=${policy.projectId}&target=production&limit=100`)).deployments ?? [];
    const candidate = list.find(d => d.source === 'git' && d.meta?.githubCommitRef === 'main' && d.meta?.githubCommitSha === revision);
    if (candidate) {
      const detail = await vercel(`/v13/deployments/${candidate.uid}`);
      if (['ERROR','CANCELED'].includes(detail.readyState)) throw Error('The main deployment failed; the live domain was not changed.');
      if (detail.readyState === 'READY') {assertProductionDeployment(detail,revision);deployment=detail;break;}
    }
    if (attempt+1<attempts) await wait(15000);
  }
  if (!deployment) throw Error('No ready Git deployment for current main; the live domain was not changed.');

  // Validate every binding before the first mutation. Never move back from a
  // newer or unrelated production revision, even after a force-pushed main.
  const bindings=[];
  for (const domain of policy.domains) {
    const alias=await vercel(`/v4/aliases/${domain}`);
    if (alias.projectId !== policy.projectId || !alias.deploymentId) throw Error('Unexpected production domain binding.');
    const live=await vercel(`/v13/deployments/${alias.deploymentId}`);
    const liveRevision=live.meta?.githubCommitSha;
    if (!validRevision(liveRevision) || live.source !== 'git') throw Error('Current production provenance is unknown; manual recovery is required.');
    const comparison=await github(`${repo}/compare/${liveRevision}...${revision}`);
    if (!['ahead','identical'].includes(comparison.status)) throw Error('Refusing a production downgrade or unrelated Git history.');
    bindings.push({domain,previousId:alias.deploymentId});
  }
  for (const {domain,previousId} of bindings) {
    await currentMain();
    if ((await vercel(`/v4/aliases/${domain}`)).deploymentId !== previousId) throw Error('Production changed concurrently; refusing to overwrite it.');
    if (previousId !== deployment.id) await vercel(`/v2/deployments/${deployment.id}/aliases`,{alias:domain});
    if ((await vercel(`/v4/aliases/${domain}`)).deploymentId !== deployment.id) throw Error('Production binding verification failed.');
  }
  for (const domain of policy.domains) {
    let verified=false;
    for(let attempt=0;attempt<10;attempt++) {
      const info=await liveInfo(domain,revision);
      if(info.revision===revision && info.branch==='main' && info.environment==='production'){verified=true;break;}
      await wait(1000);
    }
    if(!verified) throw Error('The public build revision could not be verified.');
  }
  if ((await vercel(`/v9/projects/${policy.projectId}`)).autoAssignCustomDomains !== false) throw Error('Automatic domain assignment must remain disabled.');
  return {revision,deploymentId:deployment.id,domains:policy.domains};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.VERCEL_SITE_PUBLISH_TOKEN || !process.env.GITHUB_TOKEN) throw Error('Protected Production environment credentials are required.');
  const result=await publishSite({
    revision:process.env.SITE_RELEASE_SHA,
    github:jsonApi('https://api.github.com',process.env.GITHUB_TOKEN),
    vercel:jsonApi('https://api.vercel.com',process.env.VERCEL_SITE_PUBLISH_TOKEN),
    liveInfo:async(domain,revision)=>{
      const response=await fetch(`https://${domain}/build-info.json?revision=${revision}`,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
      if(!response.ok) throw Error('The public release manifest is unavailable.');
      return response.json();
    },
  });
  console.log(JSON.stringify(result));
  if(process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,`Published main \`${result.revision}\` to https://campuscli.com\n\nDeployment: \`${result.deploymentId}\`. Automatic domain assignment remains disabled.\n`);
}
