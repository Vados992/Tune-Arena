import test from 'node:test';
import assert from 'node:assert/strict';
import { configureCloudflareBuilds } from '../cloudflare-builds.mjs';
import { cloudflareTarget, deploymentAccount, assertProductionBranch } from '../../web/scripts/cloudflare-target.mjs';
import { resolveDeploymentEnvironment } from '../../web/scripts/cloudflare-resources.mjs';
import { productionConfig } from '../../web/scripts/cloudflare-config.mjs';

const token = 'test-credential-must-not-appear-in-errors';
const env = { CLOUDFLARE_ACCOUNT_ID: cloudflareTarget.account_id, CLOUDFLARE_API_TOKEN: token };
const tag = '1'.repeat(32);
const result = (value, status = 200) => new Response(JSON.stringify({ success: status < 400, result: value, errors: status >= 400 ? [{ code: 10000, message: token }] : [] }), { status });
function server({ wrongRepository = false, failure, ignorePatch = false } = {}) {
  const calls = [];
  const config = { git_repository: { provider_type: 'github', provider_account_name: 'Vados992', repo_name: 'Tune-Arena', repo_id: wrongRepository ? '999' : cloudflareTarget.repository_id, branch: 'dependabot/github_actions/example' }, production_settings: { build_token_uuid: 'existing-token-reference', build_command: '', deploy_command: 'npx wrangler preview', root_directory: '/', environment_variables: { EXISTING_SECRET: { is_secret: true } } }, previews_enabled: true };
  const fetcher = async (url, options) => {
    assert.equal(new URL(url).origin, 'https://api.cloudflare.com');
    assert.ok(new URL(url).pathname.startsWith(`/client/v4/accounts/${cloudflareTarget.account_id}/`));
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    assert.equal(options.redirect, 'error');
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ method: options.method, body });
    if (failure) return result(null, failure);
    if (url.endsWith('/workers/scripts')) return result([{ id: 'tune-arena', tag }]);
    assert.ok(url.endsWith('/builds/workers/' + tag));
    if (options.method === 'PATCH' && !ignorePatch) {
      Object.assign(config.git_repository, body.git_repository);
      const variables = { ...config.production_settings.environment_variables, ...body.production_settings.environment_variables };
      Object.assign(config.production_settings, body.production_settings, { environment_variables: variables });
      config.previews_enabled = body.previews_enabled;
    }
    return result(config);
  };
  return { calls, config, fetcher };
}

test('wrong accounts and non-production branches are rejected before any remote operation, including manual storage mode', async () => {
  const wrong = { ...env, CLOUDFLARE_ACCOUNT_ID: '8877016c6dcca78dd71c7d5509976645' };
  const noNetwork = () => assert.fail('must stop before sending credentials');
  assert.throws(() => deploymentAccount(wrong), /Wrong Cloudflare account/);
  await assert.rejects(configureCloudflareBuilds(wrong, { apply: true, fetcher: noNetwork }), /Wrong Cloudflare account/);
  await assert.rejects(resolveDeploymentEnvironment({ ...wrong, TUNE_D1_DATABASE_ID: '11111111-1111-4111-8111-111111111111', TUNE_R2_BUCKET_NAME: 'old-bucket', TUNE_APP_ORIGIN: 'https://old.example' }, noNetwork), /Wrong Cloudflare account/);
  await assert.rejects(resolveDeploymentEnvironment({ ...env, WORKERS_CI_BRANCH: 'dependabot/example' }, noNetwork), /restricted to main/);
  assert.throws(() => assertProductionBranch({ WORKERS_CI_BRANCH: 'feature/example' }), /restricted to main/);
  assertProductionBranch({ WORKERS_CI_BRANCH: 'main' });
});
test('generated production config overrides a stale account ID from a previous build', () => {
  const config = productionConfig({ account_id: '8877016c6dcca78dd71c7d5509976645' }, { ...env, TUNE_D1_DATABASE_ID: '11111111-1111-4111-8111-111111111111', TUNE_R2_BUCKET_NAME: 'target-photos', TUNE_APP_ORIGIN: 'https://target.example' }, '/migrations');
  assert.equal(config.account_id, cloudflareTarget.account_id);
});
test('check reports bad branch/commands without changing Cloudflare', async () => {
  const s = server();
  const report = await configureCloudflareBuilds(env, { fetcher: s.fetcher });
  assert.equal(report.ready, false);
  assert.ok(report.differences.includes('build_command'));
  assert.ok(report.differences.includes('production_branch'));
  assert.equal(s.calls.some(call => call.method !== 'GET'), false);
});
test('repair updates only the intended settings, preserves token/secrets, verifies and is idempotent', async () => {
  const s = server();
  const report = await configureCloudflareBuilds(env, { apply: true, fetcher: s.fetcher });
  assert.equal(report.ready, true);
  assert.equal(report.applied, true);
  assert.equal(s.config.production_settings.build_token_uuid, 'existing-token-reference');
  assert.deepEqual(s.config.production_settings.environment_variables.EXISTING_SECRET, { is_secret: true });
  assert.equal(JSON.stringify(report).includes(token), false);
  assert.equal(s.calls.filter(call => call.method === 'PATCH').length, 1);
  assert.equal(s.calls.some(call => !['GET', 'PATCH'].includes(call.method)), false);
  assert.equal((await configureCloudflareBuilds(env, { apply: true, fetcher: s.fetcher })).applied, false);
  assert.equal(s.calls.filter(call => call.method === 'PATCH').length, 1);
});
test('wrong repository, denied access and failed read-back never silently reconnect or report success', async () => {
  const wrong = server({ wrongRepository: true });
  await assert.rejects(configureCloudflareBuilds(env, { apply: true, fetcher: wrong.fetcher }), /expected GitHub repository/);
  assert.equal(wrong.calls.some(call => call.method === 'PATCH'), false);
  for (const status of [401, 403, 429, 500]) {
    const denied = server({ failure: status });
    await assert.rejects(configureCloudflareBuilds(env, { apply: true, fetcher: denied.fetcher }), error => {
      assert.ok(error.message.includes('HTTP ' + status));
      assert.equal(error.message.includes(token), false);
      return true;
    });
    assert.equal(denied.calls.length, 1);
  }
  const ignored = server({ ignorePatch: true });
  await assert.rejects(configureCloudflareBuilds(env, { apply: true, fetcher: ignored.fetcher }), /verification failed/);
});
