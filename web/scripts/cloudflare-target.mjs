import { readFileSync } from 'node:fs';

export const cloudflareTarget = Object.freeze(JSON.parse(readFileSync(new URL('../../config/cloudflare.json', import.meta.url), 'utf8')));
if (!/^[a-f0-9]{32}$/i.test(cloudflareTarget.account_id || '')) throw new Error('Invalid account_id in config/cloudflare.json.');

export function deploymentAccount(env) {
  const account = env.CLOUDFLARE_ACCOUNT_ID || cloudflareTarget.account_id;
  if (account !== cloudflareTarget.account_id) {
    throw new Error(`Wrong Cloudflare account. This project targets ${cloudflareTarget.account_id}; update config/cloudflare.json deliberately before changing accounts.`);
  }
  return account;
}

export function assertProductionBranch(env) {
  if (env.WORKERS_CI_BRANCH && env.WORKERS_CI_BRANCH !== cloudflareTarget.production_branch) {
    throw new Error('Production deployment is restricted to main. Disable non-production branch builds in Cloudflare; Dependabot branches must not publish the production application.');
  }
}
