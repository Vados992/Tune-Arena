import { administratorTelegramIds } from '../lib/telegram-init-data.mjs';

export function deploymentSettings(env) {
  const required = ['TUNE_D1_DATABASE_ID', 'TUNE_R2_BUCKET_NAME', 'TUNE_APP_ORIGIN'];
  const missing = required.filter(key => !env[key]);
  if (missing.length) throw new Error(`Set Cloudflare build variables: ${missing.join(', ')}. See docs/CLOUDFLARE_BUILDS_RU.md.`);
  const id = env.TUNE_D1_DATABASE_ID;
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id) ||
      ['00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000000'].includes(id)) {
    throw new Error('TUNE_D1_DATABASE_ID must be the real D1 database UUID, not the local preview placeholder.');
  }
  let url;
  try { url = new URL(env.TUNE_APP_ORIGIN); } catch { throw new Error('TUNE_APP_ORIGIN must be an HTTPS origin.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('TUNE_APP_ORIGIN must be an HTTPS origin without credentials, path or query.');
  }
  if ((env.TUNE_ADMIN_TELEGRAM_IDS || env.TUNE_ADMIN_TELEGRAM_ID) &&
      !administratorTelegramIds(env.TUNE_ADMIN_TELEGRAM_IDS, env.TUNE_ADMIN_TELEGRAM_ID).length) {
    throw new Error('Invalid administrator Telegram ID allowlist.');
  }
  return { id, bucket: env.TUNE_R2_BUCKET_NAME, origin: url.origin, name: env.TUNE_WORKER_NAME || 'tune-arena' };
}

export function productionConfig(base, env, migrationsDir) {
  const settings = deploymentSettings(env);
  return {
    ...base,
    name: settings.name,
    d1_databases: [{ binding: 'DB', database_name: 'tune-arena', database_id: settings.id, migrations_dir: migrationsDir }],
    r2_buckets: [{ binding: 'BUCKET', bucket_name: settings.bucket }],
    vars: {
      ENVIRONMENT: 'production', TRUST_SITE_AUTH: '0', APP_ORIGIN: settings.origin,
      ...(env.TUNE_ADMIN_TELEGRAM_ID ? { TUNE_ADMIN_TELEGRAM_ID: env.TUNE_ADMIN_TELEGRAM_ID } : {}),
      ...(env.TUNE_ADMIN_TELEGRAM_IDS ? { TUNE_ADMIN_TELEGRAM_IDS: env.TUNE_ADMIN_TELEGRAM_IDS } : {}),
    },
  };
}
