import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { deploymentSettings } from '../web/scripts/cloudflare-config.mjs';

const web = fileURLToPath(new URL('../web/', import.meta.url));
const [command, ...args] = process.argv.slice(2);
const dryRun = command === 'deploy' && args.length === 1 && args[0] === '--dry-run';
if (!['build', 'deploy'].includes(command) || (args.length && !dryRun)) {
  throw new Error('Usage: node scripts/cloudflare.mjs build|deploy [--dry-run]');
}
function run(executable, arguments_) {
  const result = spawnSync(executable, arguments_, { cwd: web, stdio: 'inherit', shell: process.platform === 'win32' && executable.endsWith('.cmd') });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
function npm(args) { run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args); }

// Fail with actionable setting names before installing or touching remote resources.
deploymentSettings(process.env);
if (command === 'build') {
  npm(['ci', '--no-audit', '--no-fund']);
  npm(['run', 'build']);
}
if (!existsSync(path.join(web, 'dist/server/index.js')) || !existsSync(path.join(web, 'dist/client'))) {
  throw new Error('Missing web production build. Run npm run build:cloudflare first; set that as the Cloudflare Build command.');
}
run(process.execPath, ['scripts/prepare-cloudflare.mjs']);
if (command === 'deploy') {
  if (!dryRun) npm(['run', 'db:remote']);
  // Use the lockfile-pinned local Wrangler and the generated server configuration.
  run(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'deploy', '--config', 'dist/server/wrangler.deploy.json', ...(dryRun ? ['--dry-run'] : [])]);
}
