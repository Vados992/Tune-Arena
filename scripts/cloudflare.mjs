import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { deploymentSettings } from '../web/scripts/cloudflare-config.mjs';
import { resolveDeploymentEnvironment } from '../web/scripts/cloudflare-resources.mjs';

const web = fileURLToPath(new URL('../web/', import.meta.url));
const [command, ...args] = process.argv.slice(2);
const dryRun = command === 'deploy' && args.length === 1 && args[0] === '--dry-run';
let deploymentEnv = process.env;
if (!['build', 'deploy'].includes(command) || (args.length && !dryRun)) {
  throw new Error('Usage: node scripts/cloudflare.mjs build|deploy [--dry-run]');
}
function run(executable, arguments_) {
  const result = spawnSync(executable, arguments_, { cwd: web, env: deploymentEnv, stdio: 'inherit', shell: process.platform === 'win32' && executable.endsWith('.cmd') });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
function npm(args) { run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args); }

if (command === 'build') {
  npm(['ci', '--no-audit', '--no-fund']);
  npm(['run', 'build']);
}
if (!existsSync(path.join(web, 'dist/server/index.js')) || !existsSync(path.join(web, 'dist/client'))) {
  throw new Error('Missing web production build. Run npm run build:cloudflare first; set that as the Cloudflare Build command.');
}
if (command === 'build') {
  if (['TUNE_D1_DATABASE_ID', 'TUNE_R2_BUCKET_NAME', 'TUNE_APP_ORIGIN'].every(key => process.env[key])) {
    run(process.execPath, ['scripts/prepare-cloudflare.mjs']);
  } else {
    // Compilation does not create resources or require their identifiers.
    rmSync(path.join(web, '../.wrangler/deploy/config.json'), { force: true });
    console.log('Build ready. Run npm run deploy:cloudflare to resolve D1/R2 and publish. No remote resources were accessed during compilation.');
  }
}
if (command === 'deploy') {
  if (dryRun) deploymentSettings(deploymentEnv); // Dry-runs never provision resources.
  else deploymentEnv = await resolveDeploymentEnvironment(deploymentEnv);
  run(process.execPath, ['scripts/prepare-cloudflare.mjs']);
  if (!dryRun) npm(['run', 'db:remote']);
  // Use the lockfile-pinned local Wrangler and the generated server configuration.
  run(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'deploy', '--config', 'dist/server/wrangler.deploy.json', ...(dryRun ? ['--dry-run'] : [])]);
}
