import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDeploymentEnvironment } from '../../web/scripts/cloudflare-resources.mjs';
import { productionConfig } from '../../web/scripts/cloudflare-config.mjs';

const ID = '11111111-1111-4111-8111-111111111111';
const account = 'a'.repeat(32);
const secret = 'test-only-never-log-this-value';
const auth = { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: secret, TUNE_WORKER_NAME: 'tune-arena' };
const manual = { TUNE_D1_DATABASE_ID: ID, TUNE_R2_BUCKET_NAME: 'existing-photos', TUNE_APP_ORIGIN: 'https://arena.example' };
const response = (result, status = 200) => new Response(JSON.stringify({ success: status < 400, result, errors: status < 400 ? [] : [{ code: 10000, message: secret }] }), { status });
function cloud({ bindings, databases = [], bucketExists = false, workerStatus = 200, subdomain = 'owner', pages } = {}) {
  const calls = [];
  const state = { databases: [...databases], bucketExists };
  const fetcher = async (url, options) => {
    assert.equal(new URL(url).origin, 'https://api.cloudflare.com');
    assert.equal(options.headers.Authorization, `Bearer ${secret}`);
    assert.equal(options.redirect, 'error');
    const endpoint = url.split(`/accounts/${account}`)[1];
    calls.push({ endpoint, method: options.method, body: options.body && JSON.parse(options.body) });
    if (endpoint.includes('/workers/scripts/')) return response({ bindings: bindings || [] }, workerStatus);
    if (endpoint === '/workers/subdomain') return response({ subdomain });
    if (endpoint.startsWith('/d1/database?')) {
      const page = Number(new URL(url).searchParams.get('page'));
      if (pages) return new Response(JSON.stringify({ success: true, result: pages[page - 1], result_info: { per_page: 100, total_count: 101 } }));
      return response(state.databases);
    }
    if (endpoint === '/d1/database' && options.method === 'POST') {
      const result = { uuid: ID, name: JSON.parse(options.body).name };
      state.databases.push(result);
      return response(result);
    }
    if (endpoint.startsWith('/r2/buckets/') && options.method === 'GET') return response({ name: 'tune-arena-photos' }, state.bucketExists ? 200 : 404);
    if (endpoint === '/r2/buckets' && options.method === 'POST') { state.bucketExists = true; return response({ name: 'tune-arena-photos' }); }
    throw new Error('Unexpected request: ' + endpoint);
  };
  return { calls, state, fetcher };
}

test('explicit manual settings need no API credential or network access', async () => {
  const result = await resolveDeploymentEnvironment(manual, () => assert.fail('network should not be used'));
  assert.equal(result.TUNE_D1_DATABASE_ID, ID);
  assert.equal(result.TUNE_APP_ORIGIN, 'https://arena.example');
  await assert.rejects(resolveDeploymentEnvironment({ ...manual, TUNE_D1_DATABASE_ID: 'bad' }, () => assert.fail()), /real D1/);
});
test('missing credentials fail before touching remote resources', async () => {
  await assert.rejects(resolveDeploymentEnvironment({}, () => assert.fail()), /CLOUDFLARE_ACCOUNT_ID/);
});
test('first deployment creates D1/R2; retries reuse them without deletes or duplicate creates', async () => {
  const server = cloud({ workerStatus: 404 });
  const logs = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await resolveDeploymentEnvironment(auth, server.fetcher, value => logs.push(value));
    assert.equal(result.TUNE_D1_DATABASE_ID, ID);
    assert.equal(result.TUNE_R2_BUCKET_NAME, 'tune-arena-photos');
    assert.equal(result.TUNE_APP_ORIGIN, 'https://tune-arena.owner.workers.dev');
    assert.equal(result.TUNE_D1_DATABASE_NAME, 'tune-arena');
  }
  assert.equal(server.calls.filter(call => call.method === 'POST').length, 2);
  assert.equal(server.calls.some(call => call.method === 'DELETE'), false);
  assert.equal(logs.join(' ').includes(secret), false);
});
test('existing Worker storage, custom origin and owner allowlist are retained', async () => {
  const server = cloud({ bindings: [
    { name: 'DB', type: 'd1', id: ID },
    { name: 'BUCKET', type: 'r2_bucket', bucket_name: 'my-old-bucket', jurisdiction: 'eu' },
    { name: 'APP_ORIGIN', type: 'plain_text', text: 'https://arena.example' },
    { name: 'TUNE_ADMIN_TELEGRAM_IDS', type: 'plain_text', text: '123456789' },
    { name: 'TELEGRAM_BOT_TOKEN', type: 'secret_text' },
  ] });
  const result = await resolveDeploymentEnvironment(auth, server.fetcher, () => {});
  assert.equal(result.TUNE_R2_BUCKET_NAME, 'my-old-bucket');
  assert.equal(result.TUNE_ADMIN_TELEGRAM_IDS, '123456789');
  assert.equal(result.TUNE_APP_ORIGIN, 'https://arena.example');
  assert.equal(server.calls.length, 1);
  const config = productionConfig({ main: 'index.js' }, result, '/drizzle');
  assert.equal(config.r2_buckets[0].jurisdiction, 'eu');
  assert.equal(JSON.stringify(config).includes(secret), false);
  assert.equal(config.vars.TELEGRAM_BOT_TOKEN, undefined);
});
test('Cloudflare CI Worker name is used consistently for discovery, origin and production config', async () => {
  const server = cloud({ databases: [{ name: 'cloudflare-worker', uuid: ID }], bucketExists: true });
  const result = await resolveDeploymentEnvironment({ ...auth, WRANGLER_CI_OVERRIDE_NAME: 'cloudflare-worker' }, server.fetcher, () => {});
  assert.equal(server.calls[0].endpoint, '/workers/scripts/cloudflare-worker/settings');
  assert.equal(result.TUNE_APP_ORIGIN, 'https://cloudflare-worker.owner.workers.dev');
  assert.equal(productionConfig({}, result, '/drizzle').name, 'cloudflare-worker');
  assert.equal(server.calls.some(call => call.method === 'POST'), false);
});
test('D1 discovery follows pagination before deciding to create', async () => {
  const page1 = Array.from({ length: 100 }, (_, index) => ({ name: `other-${index}`, uuid: ID }));
  const server = cloud({ pages: [page1, [{ name: 'tune-arena', uuid: ID }]], bucketExists: true });
  await resolveDeploymentEnvironment(auth, server.fetcher, () => {});
  assert.equal(server.calls.some(call => call.endpoint.includes('page=2')), true);
  assert.equal(server.calls.some(call => call.method === 'POST'), false);
});
test('permission and server errors are not interpreted as missing resources, and secrets are redacted', async () => {
  for (const status of [401, 403, 429, 500]) {
    const server = cloud({ workerStatus: status });
    await assert.rejects(resolveDeploymentEnvironment(auth, server.fetcher), error => {
      assert.match(error.message, new RegExp(`HTTP ${status}`));
      assert.equal(error.message.includes(secret), false);
      return true;
    });
    assert.equal(server.calls.some(call => call.method !== 'GET'), false);
  }
});
test('existing storage type mismatches and accidental rebinding stop before mutations', async () => {
  for (const bindings of [[{ name: 'DB', type: 'kv_namespace', namespace_id: 'other' }], [{ name: 'DB', type: 'd1', id: '22222222-2222-4222-8222-222222222222' }]]) {
    const server = cloud({ bindings });
    await assert.rejects(resolveDeploymentEnvironment({ ...auth, TUNE_D1_DATABASE_ID: ID }, server.fetcher), /unexpected types|Refusing to switch/);
    assert.equal(server.calls.some(call => call.method !== 'GET'), false);
  }
});
test('invalid origin, owner IDs and missing workers.dev subdomain never create resources', async () => {
  for (const extra of [{ TUNE_APP_ORIGIN: 'http://insecure.example' }, { TUNE_ADMIN_TELEGRAM_IDS: '@nickname' }, {}]) {
    const server = cloud({ subdomain: '' });
    await assert.rejects(resolveDeploymentEnvironment({ ...auth, ...extra }, server.fetcher));
    assert.equal(server.calls.some(call => call.method !== 'GET'), false);
  }
});
test('network failure and invalid API bodies fail closed without exposing request credentials', async () => {
  for (const fetcher of [async () => { throw new Error(secret); }, async () => new Response(secret), async () => response({})]) {
    await assert.rejects(resolveDeploymentEnvironment(auth, fetcher), error => !error.message.includes(secret));
  }
});
