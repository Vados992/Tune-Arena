"use strict";
function normalizeOrigin(value){
 const url=new URL(value);
 if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw new Error("Enter an HTTPS origin without a path, credentials, query or fragment.");
 return url.origin;
}
function sameOrigin(value,origin){try{return new URL(value).origin===normalizeOrigin(origin);}catch{return false;}}
function externalAllowed(value){try{return ["https:","mailto:"].includes(new URL(value).protocol);}catch{return false;}}
function cameraAllowed(origin,appOrigin,mediaTypes){return sameOrigin(origin,appOrigin)&&Array.isArray(mediaTypes)&&mediaTypes.length>0&&mediaTypes.every(x=>x==="video");}
module.exports={normalizeOrigin,sameOrigin,externalAllowed,cameraAllowed};
