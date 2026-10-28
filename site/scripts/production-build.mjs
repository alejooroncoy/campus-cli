import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {siteProduction, validRevision} from './production-policy.mjs';

export async function productionBuildInfo(env, readMain) {
  const info = {environment:env.VERCEL_ENV ?? 'development',branch:env.VERCEL_GIT_COMMIT_REF ?? null,revision:env.VERCEL_GIT_COMMIT_SHA ?? null};
  if (info.environment !== 'production') return info;
  if (env.VERCEL_GIT_PROVIDER !== 'github' || info.branch !== siteProduction.branch
    || `${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}` !== siteProduction.repository
    || !validRevision(info.revision)) throw Error('Production builds require GitHub main provenance. Local uploads are not a publication path.');
  if (await readMain() !== info.revision) throw Error('Production build superseded by a newer main commit.');
  return info;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const info = await productionBuildInfo(process.env, async () => {
    const response = await fetch(`https://api.github.com/repos/${siteProduction.repository}/git/ref/heads/main`, {
      headers:{accept:'application/vnd.github+json','cache-control':'no-cache'}, signal:AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error(`Cannot verify main (${response.status}); refusing production build.`);
    return (await response.json()).object?.sha;
  });
  await writeFile(new URL('../public/build-info.json', import.meta.url), JSON.stringify(info)+'\n');
  console.log(`Site build provenance: ${info.environment} ${info.branch ?? 'local'} ${info.revision ?? 'unpublished'}`);
}
