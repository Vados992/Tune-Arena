import { administratorTelegramIds } from '../lib/telegram-init-data.mjs';
import { deploymentSettings, deploymentWorkerName } from './cloudflare-config.mjs';
import { deploymentAccount, assertProductionBranch } from './cloudflare-target.mjs';

// Uses the token already provided to the Cloudflare build. No credentials are
// persisted in the repository, generated config, or log messages.
export async function resolveDeploymentEnvironment(input, fetcher = fetch, log = console.log) {
  deploymentAccount(input);
  assertProductionBranch(input);
  const env = { ...input, CLOUDFLARE_ACCOUNT_ID: deploymentAccount(input) };
  const required = ['TUNE_D1_DATABASE_ID', 'TUNE_R2_BUCKET_NAME', 'TUNE_APP_ORIGIN'];
  if (required.every(key => env[key])) {
    deploymentSettings(env);
    return env;
  }
  const name = deploymentWorkerName(env);
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(name)) throw new Error('Set TUNE_WORKER_NAME to the exact Cloudflare Worker name.');
  if (!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID || '') || !env.CLOUDFLARE_API_TOKEN) {
    throw new Error('Automatic setup needs CLOUDFLARE_ACCOUNT_ID and a Cloudflare build API token with Workers Scripts, D1 and R2 edit permissions. Set them in Cloudflare Build Variables and Secrets, not in chat. Alternatively set TUNE_D1_DATABASE_ID, TUNE_R2_BUCKET_NAME and TUNE_APP_ORIGIN manually.');
  }
  if ((env.TUNE_ADMIN_TELEGRAM_IDS || env.TUNE_ADMIN_TELEGRAM_ID) &&
      !administratorTelegramIds(env.TUNE_ADMIN_TELEGRAM_IDS, env.TUNE_ADMIN_TELEGRAM_ID).length) {
    throw new Error('Invalid administrator Telegram ID allowlist.');
  }
  const prefix = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}`;
  async function api(endpoint, { method = 'GET', body, allowMissing = false } = {}) {
    let response;
    try {
      response = await fetcher(prefix + endpoint, {
        method, redirect: 'error', signal: AbortSignal.timeout(30_000),
        headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new Error(`Cloudflare ${method} request failed. Check connectivity and retry; existing resources are retained.`);
    }
    if (allowMissing && response.status === 404) return null;
    let data;
    try { data = await response.json(); } catch { throw new Error(`Cloudflare API returned unreadable data (HTTP ${response.status}).`); }
    if (!response.ok || data.success !== true) {
      const codes = (data.errors || []).map(error => error.code).filter(code => Number.isInteger(code)).join(', ');
      throw new Error(`Cloudflare API ${method} failed: HTTP ${response.status}${codes ? `, codes ${codes}` : ''}. Check the selected account, build token permissions (Workers Scripts, D1, R2), and whether R2 is enabled. No resources have been deleted.`);
    }
    return data;
  }
  const current = await api(`/workers/scripts/${encodeURIComponent(name)}/settings`, { allowMissing: true });
  if (current && !Array.isArray(current.result?.bindings)) throw new Error('Cloudflare returned invalid Worker bindings; refusing to replace existing storage.');
  const bindings = current?.result?.bindings || [];
  const db = bindings.find(binding => binding.name === 'DB');
  const bucket = bindings.find(binding => binding.name === 'BUCKET');
  if ((db && (db.type !== 'd1' || !db.id)) || (bucket && (bucket.type !== 'r2_bucket' || !bucket.bucket_name))) {
    throw new Error('Existing DB/BUCKET bindings have unexpected types; check this Worker before publishing.');
  }
  if ((db && env.TUNE_D1_DATABASE_ID && env.TUNE_D1_DATABASE_ID !== db.id) ||
      (bucket && env.TUNE_R2_BUCKET_NAME && env.TUNE_R2_BUCKET_NAME !== bucket.bucket_name)) {
    throw new Error('Configured D1/R2 differs from the existing Worker bindings. Refusing to switch storage automatically.');
  }
  env.TUNE_D1_DATABASE_ID ||= db?.id;
  env.TUNE_R2_BUCKET_NAME ||= bucket?.bucket_name;
  env.TUNE_R2_JURISDICTION ||= bucket?.jurisdiction;
  for (const key of ['TUNE_ADMIN_TELEGRAM_IDS', 'TUNE_ADMIN_TELEGRAM_ID', 'APP_ORIGIN']) {
    const value = bindings.find(binding => binding.name === key && binding.type === 'plain_text')?.text;
    if (key === 'APP_ORIGIN') env.TUNE_APP_ORIGIN ||= value;
    else env[key] ||= value;
  }
  if (!env.TUNE_APP_ORIGIN) {
    const subdomain = (await api('/workers/subdomain')).result?.subdomain;
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(subdomain || '')) {
      throw new Error('Enable a workers.dev subdomain in Cloudflare or set TUNE_APP_ORIGIN to your existing HTTPS app address.');
    }
    env.TUNE_APP_ORIGIN = `https://${name}.${subdomain}.workers.dev`;
  }
  if (!env.TUNE_R2_BUCKET_NAME && !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(`${name}-photos`)) {
    throw new Error('Worker name cannot form an R2 bucket name; set TUNE_R2_BUCKET_NAME explicitly.');
  }
  // Validate URL and retained owner IDs before creating any resource.
  deploymentSettings({ ...env, TUNE_D1_DATABASE_ID: env.TUNE_D1_DATABASE_ID || '11111111-1111-4111-8111-111111111111', TUNE_R2_BUCKET_NAME: env.TUNE_R2_BUCKET_NAME || `${name}-photos` });
  if (!env.TUNE_D1_DATABASE_ID) {
    const databaseName = env.TUNE_D1_DATABASE_NAME || name;
    let existing;
    for (let page = 1; page <= 100; page++) {
      const data = await api(`/d1/database?page=${page}&per_page=100`);
      if (!Array.isArray(data.result)) throw new Error('Cloudflare returned an invalid D1 list; no database was created.');
      const matches = data.result.filter(item => item.name === databaseName);
      if (matches.length > 1) throw new Error('Multiple D1 databases have the requested name; set TUNE_D1_DATABASE_ID explicitly.');
      existing = matches[0];
      if (existing) break;
      const info = data.result_info;
      if (info?.total_count !== undefined ? page * (info.per_page || 100) >= info.total_count : data.result.length < 100) break;
      if (page === 100) throw new Error('D1 list is too large; set TUNE_D1_DATABASE_ID explicitly.');
    }
    const database = existing || (await api('/d1/database', { method: 'POST', body: { name: databaseName } })).result;
    env.TUNE_D1_DATABASE_ID = database?.uuid;
    env.TUNE_D1_DATABASE_NAME = databaseName;
    deploymentSettings({ ...env, TUNE_R2_BUCKET_NAME: env.TUNE_R2_BUCKET_NAME || `${name}-photos` });
    log(existing ? 'Reusing existing D1 database.' : 'Created D1 database. It will be reused on the next run.');
  }
  if (!env.TUNE_R2_BUCKET_NAME) {
    const bucketName = `${name}-photos`;
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucketName)) throw new Error('Worker name cannot form an R2 bucket name; set TUNE_R2_BUCKET_NAME explicitly.');
    const existing = await api(`/r2/buckets/${encodeURIComponent(bucketName)}`, { allowMissing: true });
    if (!existing) await api('/r2/buckets', { method: 'POST', body: { name: bucketName } });
    env.TUNE_R2_BUCKET_NAME = bucketName;
    log(existing ? 'Reusing existing R2 bucket.' : 'Created R2 bucket. It will be reused on the next run.');
  }
  deploymentSettings(env);
  log(`Publication settings ready for Worker ${name}.`);
  return env;
}
