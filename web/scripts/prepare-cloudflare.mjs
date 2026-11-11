import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { productionConfig, deploymentSettings } from './cloudflare-config.mjs';

const web = fileURLToPath(new URL('../', import.meta.url));
deploymentSettings(process.env);
const configPath = path.join(web, 'dist/server/wrangler.deploy.json');
const base = JSON.parse(readFileSync(path.join(web, 'dist/server/wrangler.json'), 'utf8'));
const config = productionConfig(base, process.env, path.join(web, 'drizzle'));
writeFileSync(configPath, JSON.stringify(config, null, 2));
// Wrangler must find the production server from either the repository root or web/.
// Never redirect a production deploy to the local preview D1/R2 configuration.
for (const directory of [web, path.dirname(web)]) {
  const target = path.join(directory, '.wrangler/deploy/config.json');
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify({ configPath: path.relative(path.dirname(target), configPath).split(path.sep).join('/') }));
}
console.log('Prepared standalone production Worker configuration and root/web Wrangler redirects; development sign-in is disabled.');
