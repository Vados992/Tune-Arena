import test from 'node:test';
import assert from 'node:assert/strict';
import { deploymentSettings, productionConfig } from '../../web/scripts/cloudflare-config.mjs';

const settings = {
  TUNE_D1_DATABASE_ID: '11111111-1111-4111-8111-111111111111',
  TUNE_R2_BUCKET_NAME: 'tune-arena-ci',
  TUNE_APP_ORIGIN: 'https://tune-arena.invalid',
};
test('deployment rejects missing bindings and local preview database IDs', () => {
  assert.throws(() => deploymentSettings({}), /TUNE_D1_DATABASE_ID.*TUNE_R2_BUCKET_NAME.*TUNE_APP_ORIGIN/);
  for (const id of ['bad-id', '00000000-0000-4000-8000-000000000000', '00000000-0000-0000-0000-000000000000']) {
    assert.throws(() => deploymentSettings({ ...settings, TUNE_D1_DATABASE_ID: id }), /real D1 database UUID/);
  }
});
test('production origin excludes credentials, non-HTTPS, paths and queries', () => {
  for (const origin of ['invalid', 'http://example.com', 'https://user:pass@example.com', 'https://example.com/admin', 'https://example.com/?token=secret', 'https://example.com/#token']) {
    assert.throws(() => deploymentSettings({ ...settings, TUNE_APP_ORIGIN: origin }), /HTTPS origin/);
  }
});
test('production config replaces preview bindings and strips development variables and secrets', () => {
  const base = { main: 'index.js', assets: { directory: '../client' }, no_bundle: true, vars: { LOCAL_DEV_ADMIN: '1', TRUST_SITE_AUTH: '1' }, d1_databases: [{ database_id: 'preview' }], r2_buckets: [{ bucket_name: 'preview' }] };
  const config = productionConfig(base, { ...settings, TUNE_WORKER_NAME: 'existing-worker', TUNE_ADMIN_TELEGRAM_IDS: '123456789,987654321', TELEGRAM_BOT_TOKEN: 'do-not-copy', CLOUDFLARE_API_TOKEN: 'do-not-copy' }, '/project/web/drizzle');
  assert.equal(config.name, 'existing-worker');
  assert.equal(config.main, 'index.js');
  assert.deepEqual(config.assets, base.assets);
  assert.equal(config.no_bundle, true);
  assert.deepEqual(config.d1_databases, [{ binding: 'DB', database_name: 'existing-worker', database_id: settings.TUNE_D1_DATABASE_ID, migrations_dir: '/project/web/drizzle' }]);
  assert.deepEqual(config.r2_buckets, [{ binding: 'BUCKET', bucket_name: settings.TUNE_R2_BUCKET_NAME }]);
  assert.deepEqual(config.vars, { ENVIRONMENT: 'production', TRUST_SITE_AUTH: '0', APP_ORIGIN: settings.TUNE_APP_ORIGIN, TUNE_ADMIN_TELEGRAM_IDS: '123456789,987654321' });
  assert.equal(JSON.stringify(config).includes('do-not-copy'), false);
  assert.deepEqual(base.vars, { LOCAL_DEV_ADMIN: '1', TRUST_SITE_AUTH: '1' });
});
test('invalid owner IDs cannot grant administrator access', () => {
  assert.throws(() => deploymentSettings({ ...settings, TUNE_ADMIN_TELEGRAM_IDS: '@nickname' }), /Invalid administrator/);
});
