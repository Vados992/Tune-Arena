export function httpsURL(value:unknown,optional=true){
 if(value===''||value==null)return optional?'':null;
 if(typeof value!=='string'||value.length>1200)return null;
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
export const textValue=(value:unknown,max=200)=>typeof value==='string'&&value.trim().length<=max?value.trim():null;
export const integer=(value:unknown,min:number,max:number)=>typeof value==='number'&&Number.isInteger(value)&&value>=min&&value<=max;
export async function verifyStripeSignature(raw:string,header:string,secret:string,clock=Math.floor(Date.now()/1000)){
 const bits=header.split(',').map(v=>v.split('='));const time=bits.find(([k])=>k==='t')?.[1];
 if(!time||!/^\d+$/.test(time)||Math.abs(clock-Number(time))>300)return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 for(const [kind,value]of bits){if(kind!=='v1'||!/^[a-f0-9]{64}$/i.test(value??''))continue;
 const sig=Uint8Array.from(value.match(/../g)!,x=>parseInt(x,16));
 if(await crypto.subtle.verify('HMAC',key,sig,new TextEncoder().encode(time+'.'+raw)))return true;}
 return false;
}
