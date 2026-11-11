import './sites-env.mjs';
import {readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
const {getPlatformProxy}=await import('wrangler');
// Bind directly to local D1. Wrangler's SQL text splitter can separate END inside
// CREATE TRIGGER / CASE expressions; Drizzle already marks exact statements.
const proxy=await getPlatformProxy({configPath:path.resolve('dist/server/wrangler.json'),persist:{path:path.resolve('.wrangler/state/v3')},remoteBindings:false});
try{
 const db=proxy.env.DB;
 await db.prepare('CREATE TABLE IF NOT EXISTS tune_migrations(name TEXT PRIMARY KEY NOT NULL)').run();
 const done=new Set((await db.prepare('SELECT name FROM tune_migrations').all()).results.map(x=>x.name));
 let count=0;
 for(const name of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort()){
  if(done.has(name))continue;
  const statements=readFileSync('drizzle/'+name,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);
  await db.batch([...statements.map(s=>db.prepare(s)),db.prepare('INSERT INTO tune_migrations(name) VALUES(?)').bind(name)]);
  console.log('Applied',name);count++;
 }
 console.log(count?'Local migrations completed.':'Local database is up to date.');
}finally{await proxy.dispose();}
