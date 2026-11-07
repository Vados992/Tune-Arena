import {readFileSync,writeFileSync,mkdirSync}from "node:fs";
import path from "node:path";
import {fileURLToPath}from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const config=JSON.parse(readFileSync(path.join(root,"config/server.json"),"utf8"));
if(process.argv[2]){const u=new URL(process.argv[2]);if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["/", ""].includes(u.pathname))throw new Error("Use an HTTPS origin, without a path or credentials");config.appUrl=u.origin;writeFileSync(path.join(root,"config/server.json"),JSON.stringify(config,null,2)+"\n");}
for(const file of ["desktop/server.json","ios/TuneArena/ServerConfig.json","android/app/src/main/assets/server.json"]){const full=path.join(root,file);mkdirSync(path.dirname(full),{recursive:true});writeFileSync(full,JSON.stringify({appUrl:config.appUrl},null,2)+"\n");}
console.log("Client server:",config.appUrl);
