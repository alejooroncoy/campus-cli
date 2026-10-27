import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {productionBuildInfo} from './production-build.mjs';
import {siteProduction as policy} from './production-policy.mjs';
import {publishSite,jsonApi} from '../../scripts/publish-site-production.mjs';

const revision='b'.repeat(40), previous='a'.repeat(40);
const env={VERCEL_ENV:'production',VERCEL_GIT_PROVIDER:'github',VERCEL_GIT_COMMIT_REF:'main',VERCEL_GIT_COMMIT_SHA:revision,VERCEL_GIT_REPO_OWNER:'alejooroncoy',VERCEL_GIT_REPO_SLUG:'campus-cli'};
test('production builds require current GitHub main; local and preview builds remain usable',async()=>{
  assert.equal((await productionBuildInfo(env,async()=>revision)).revision,revision);
  for(const patch of [{VERCEL_GIT_PROVIDER:''},{VERCEL_GIT_COMMIT_REF:'codex/stale'},{VERCEL_GIT_COMMIT_SHA:''},{VERCEL_GIT_REPO_OWNER:'other'}])await assert.rejects(productionBuildInfo({...env,...patch},async()=>revision));
  await assert.rejects(productionBuildInfo(env,async()=>previous),/superseded/);
  assert.equal((await productionBuildInfo({},async()=>{throw Error('Do not query GitHub locally');})).environment,'development');
});

function fixture(options={}) {
  const mutations=[];let liveId='dpl_previous',mainReads=0,aliasReads=0;
  const deployment={id:'dpl_candidate',projectId:policy.projectId,source:'git',target:'production',readyState:'READY',meta:{githubCommitRef:'main',githubCommitSha:revision,githubCommitOrg:'alejooroncoy',githubCommitRepo:'campus-cli'},...(options.deployment??{})};
  const project={autoAssignCustomDomains:false,link:{productionBranch:'main',org:'alejooroncoy',repo:'campus-cli'},...(options.project??{})};
  const run={head_sha:revision,head_branch:'main',event:'push',status:'completed',conclusion:'success',head_repository:{full_name:policy.repository},...(options.run??{})};
  const github=async path=>{
    if(path.includes('/git/ref/')){mainReads++;return {object:{sha:options.stale||options.advanceMain&&mainReads>=3?previous:revision}};}
    if(path.includes('/actions/'))return {workflow_runs:[run]};
    if(path.includes('/compare/'))return {status:options.comparison??'ahead'};
    throw Error('Unexpected GitHub request '+path);
  };
  const vercel=async(path,body)=>{
    if(body!==undefined){mutations.push({path,body});liveId=deployment.id;return {alias:body.alias};}
    if(path===`/v9/projects/${policy.projectId}`)return project;
    if(path.startsWith('/v6/deployments'))return {deployments:options.noDeployment?[]:[{uid:deployment.id,source:deployment.source,meta:deployment.meta}]};
    if(path===`/v13/deployments/${deployment.id}`)return deployment;
    if(path===`/v13/deployments/dpl_previous`)return {source:options.unknownCurrent?'cli':'git',meta:{githubCommitSha:previous}};
    if(path.startsWith('/v4/aliases/')){aliasReads++;return {projectId:policy.projectId,deploymentId:options.concurrent&&aliasReads===2?'dpl_other':liveId};}
    throw Error('Unexpected Vercel request '+path);
  };
  return {mutations,input:{revision,github,vercel,attempts:1,wait:async()=>{},liveInfo:async()=>({revision,branch:'main',environment:'production'})}};
}
test('only checked current main can move the production domain and auto-aliasing stays off',async()=>{
  const f=fixture();const result=await publishSite(f.input);
  assert.equal(result.revision,revision);
  assert.deepEqual(f.mutations,[{path:'/v2/deployments/dpl_candidate/aliases',body:{alias:'campuscli.com'}}]);
});
for(const [name,options] of [
  ['stale main',{stale:true}],['main advanced while waiting',{advanceMain:true}],
  ['CLI upload',{deployment:{source:'cli'}}],['no matching deployment',{noDeployment:true}],
  ['preview build',{deployment:{target:'preview'}}],['another project',{deployment:{projectId:'prj_other'}}],
  ['failed build',{deployment:{readyState:'ERROR'}}],['unfinished build',{deployment:{readyState:'BUILDING'}}],
  ['failed CI',{run:{conclusion:'failure'}}],['PR CI',{run:{event:'pull_request'}}],['foreign CI',{run:{head_repository:{full_name:'other/repo'}}}],
  ['automatic domain assignment enabled',{project:{autoAssignCustomDomains:true}}],
  ['older production revision',{comparison:'behind'}],['unrelated history',{comparison:'diverged'}],
  ['unknown current provenance',{unknownCurrent:true}],['concurrent publication',{concurrent:true}],
])test(`refuses ${name} before changing any domain`,async()=>{
  const f=fixture(options);await assert.rejects(publishSite(f.input));assert.deepEqual(f.mutations,[]);
});
test('release API errors do not disclose provider bodies or forward credentials to another origin',async()=>{
  const api=jsonApi('https://api.vercel.com','PRIVATE-TOKEN',async()=>new Response('PRIVATE-TOKEN',{status:401}));
  await assert.rejects(api('/v9/projects/test'),error=>!error.message.includes('PRIVATE-TOKEN')&&error.message.includes('401'));
  await assert.rejects(api('https://untrusted.invalid/'),/origin/);
});
test('publisher credentials are confined to protected main and successful push CI, never PR code or artifacts',async()=>{
  const workflow=await readFile(new URL('../../.github/workflows/site-production.yml',import.meta.url),'utf8');
  assert.match(workflow,/branches: \[main\]/);assert.match(workflow,/environment:\s+name: Production/);
  assert.match(workflow,/github\.event\.workflow_run\.event == 'push'/);
  assert.match(workflow,/github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
  assert.match(workflow,/ref: main/);assert.match(workflow,/persist-credentials: false/);
  assert.doesNotMatch(workflow,/pull_request_target|download-artifact/);
});
