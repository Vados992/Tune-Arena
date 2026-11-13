import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cloudflareTarget as target, deploymentAccount } from '../web/scripts/cloudflare-target.mjs';

const expected = {
  build_command: 'npm run build:cloudflare',
  deploy_command: 'npm run deploy:cloudflare',
  root_directory: '/',
};

// Repairs the existing connection only. Never creates credentials, reconnects a
// different repository, deletes storage, or deploys a Worker as a side effect.
export async function configureCloudflareBuilds(env, { apply = false, fetcher = fetch } = {}) {
  const account = deploymentAccount(env);
  if (!env.CLOUDFLARE_API_TOKEN) throw new Error('Set CLOUDFLARE_API_TOKEN securely in the environment. Required: Workers Scripts Read and Workers Builds Configuration Edit for the configured account.');
  const base = `https://api.cloudflare.com/client/v4/accounts/${account}`;
  async function api(path, method = 'GET', body) {
    let response;
    try {
      response = await fetcher(base + path, {
        method, redirect: 'error', signal: AbortSignal.timeout(30_000),
        headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw new Error('Cloudflare connection request failed. Check connectivity; no credential values were logged.'); }
    let data;
    try { data = await response.json(); } catch { throw new Error(`Unreadable Cloudflare response (HTTP ${response.status}).`); }
    if (!response.ok || data.success !== true) {
      const codes = (data.errors || []).map(item => item.code).filter(Number.isInteger).join(',');
      throw new Error(`Cloudflare ${method} failed: HTTP ${response.status}${codes ? `, codes ${codes}` : ''}. Check access to account ${account}, Workers Scripts Read and Workers Builds Configuration Edit.`);
    }
    return data.result;
  }
  const workers = await api('/workers/scripts');
  if (!Array.isArray(workers)) throw new Error('Invalid Worker list; settings were not changed.');
  const worker = workers.find(item => item.id === target.worker_name);
  if (!worker || !/^[a-f0-9]{32}$/i.test(worker.tag || '')) {
    throw new Error(`Worker ${target.worker_name} is not visible in account ${account}. Check token access and the existing GitHub connection in that account. Nothing was created or changed.`);
  }
  const endpoint = `/builds/workers/${worker.tag}`;
  function verifyRepository(config) {
    const repo = config?.git_repository;
    if (!repo || repo.provider_type !== 'github' || String(repo.repo_id) !== target.repository_id ||
        `${repo.provider_account_name}/${repo.repo_name}`.toLowerCase() !== target.repository.toLowerCase()) {
      throw new Error('Cloudflare is not connected to the expected GitHub repository. Reconnection requires selecting Vados992/Tune-Arena in the Cloudflare dashboard; no settings were changed.');
    }
    if (!config.production_settings || !config.production_settings.build_token_uuid) {
      throw new Error('Select a Cloudflare build API token in Settings > Builds before repairing the connection.');
    }
  }
  const current = await api(endpoint);
  verifyRepository(current);
  function differences(config) {
    const settings = config.production_settings;
    const values = settings.environment_variables || {};
    const actualAccount = typeof values.CLOUDFLARE_ACCOUNT_ID === 'string' ? values.CLOUDFLARE_ACCOUNT_ID : values.CLOUDFLARE_ACCOUNT_ID?.value;
    return [
      ...Object.entries(expected).filter(([key, value]) => settings[key] !== value).map(([key]) => key),
      ...(config.git_repository.branch !== target.production_branch ? ['production_branch'] : []),
      ...(config.previews_enabled !== false ? ['previews_enabled'] : []),
      ...(actualAccount !== account ? ['CLOUDFLARE_ACCOUNT_ID'] : []),
    ];
  }
  const before = differences(current);
  if (apply && before.length) {
    await api(endpoint, 'PATCH', {
      git_repository: { branch: target.production_branch },
      production_settings: {
        ...expected,
        environment_variables: { CLOUDFLARE_ACCOUNT_ID: { value: account, is_secret: false } },
      },
      previews_enabled: false,
    });
  }
  const verified = apply && before.length ? await api(endpoint) : current;
  verifyRepository(verified);
  const remaining = differences(verified);
  if (apply && remaining.length) throw new Error(`Cloudflare settings verification failed: ${remaining.join(', ')}. No deployment was started.`);
  return { account, worker: target.worker_name, repository: target.repository, applied: apply && before.length > 0, ready: remaining.length === 0, differences: remaining };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const command = process.argv[2];
  try {
    if (!['check', 'repair'].includes(command) || process.argv.length !== 3) throw new Error('Usage: node scripts/cloudflare-builds.mjs check|repair');
    const result = await configureCloudflareBuilds(process.env, { apply: command === 'repair' });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ready) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
