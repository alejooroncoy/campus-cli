export const siteProduction = Object.freeze({
  repository: 'alejooroncoy/campus-cli',
  branch: 'main',
  projectId: 'prj_CkhlyuZVXCUt84OO6fMZ1EIaQNH0',
  teamId: 'team_mVVBjiP5PenZCKAkOxUg1EoK',
  domains: ['campuscli.com'],
});
export const validRevision = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

export function assertProductionDeployment(deployment, revision) {
  const meta = deployment.meta ?? {};
  if (deployment.projectId !== siteProduction.projectId || deployment.source !== 'git'
    || deployment.target !== 'production' || deployment.readyState !== 'READY'
    || meta.githubCommitRef !== siteProduction.branch || meta.githubCommitSha !== revision
    || `${meta.githubCommitOrg}/${meta.githubCommitRepo}` !== siteProduction.repository) {
    throw Error('Publication refused: expected a ready Git deployment of current main in the Campus project.');
  }
}
