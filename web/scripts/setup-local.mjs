import {existsSync,copyFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
if(!existsSync(".dev.vars"))copyFileSync(".dev.vars.example",".dev.vars");
for(const args of [["scripts/run-framework.mjs","build"],["scripts/migrate-local.mjs"]]){
 const r=spawnSync(process.execPath,args,{stdio:"inherit"});if(r.status!==0)process.exit(r.status??1);
}
console.log("Local demo ready. Start npm run dev, then open http://localhost:5173 and choose DEMO in Sign in.");
