import {readdirSync,readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
const cli=["--import","./scripts/sites-env.mjs","./node_modules/wrangler/bin/wrangler.js","d1","execute","DB","--local","--config","dist/server/wrangler.json","--persist-to",".wrangler/state"];
function run(args,json=false){const r=spawnSync(process.execPath,[...cli,...args],{encoding:"utf8",stdio:json?"pipe":"inherit"});if(r.status!==0)throw new Error(json?r.stderr:"Migration command failed");return r.stdout;}
run(["--command","CREATE TABLE IF NOT EXISTS tune_migrations(name TEXT PRIMARY KEY NOT NULL)"]);
const result=JSON.parse(run(["--command","SELECT name FROM tune_migrations","--json"],true));
const done=new Set(result.flatMap(x=>x.results??[]).map(x=>x.name));
for(const name of readdirSync("drizzle").filter(x=>x.endsWith(".sql")).sort()){
 if(done.has(name))continue;
 run(["--file","drizzle/"+name]);
 run(["--command",`INSERT INTO tune_migrations(name) VALUES('${name.replaceAll("'","''")}')`]);
 console.log("Applied",name);
}
