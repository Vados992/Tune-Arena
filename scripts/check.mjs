import {spawnSync} from "node:child_process";
const commands=[["web",process.execPath,["node_modules/typescript/bin/tsc","--noEmit"]],["web",process.execPath,["tests/arena_flow.mjs"]],["web","python3",["tests/contest_rules.py"]],["web",process.execPath,["--test","tests/pwa.test.mjs"]],["desktop",process.execPath,["--test","tests/policy.test.cjs"]]];
for(const [cwd,command,args]of commands){const r=spawnSync(command,args,{cwd,stdio:"inherit"});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status??1);}
