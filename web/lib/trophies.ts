import {db,json,failure,config,isAdministrator,origin} from './worker';
import {audit} from './commerce';
import {Interface} from 'ethers';
const evm=config as typeof config&{NFT_RPC_URL?:string;NFT_CONTRACT?:string;NFT_CHAIN_ID?:string};
const iface=new Interface(['function award(address recipient,uint256 tokenId,string uri)','event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)']);
export async function issueTrophies(){
 for(const [category,column]of [['popular','popular_entry'],['overall','overall_entry']])await db().prepare(`INSERT OR IGNORE INTO trophies(code,round_id,entry_id,owner,category,issued,token_id)
 SELECT 'TA-'||a.round_id||'-${category}',a.round_id,e.id,e.owner,?,a.created,'' FROM round_awards a JOIN entries e ON e.id=a.${column} JOIN rounds r ON r.id=a.round_id WHERE r.kind='weekly' AND e.media NOT LIKE 'sample:%'`).bind(category).run();
}
export async function trophyList(user:string|null){await issueTrophies();return json({signedIn:!!user,trophies:user?(await db().prepare('SELECT t.*,r.title,e.name FROM trophies t JOIN rounds r ON r.id=t.round_id JOIN entries e ON e.id=t.entry_id WHERE t.owner=? ORDER BY issued DESC').bind(user).all()).results:[],nftReady:!!evm.NFT_RPC_URL&&!!evm.NFT_CONTRACT&&!!evm.NFT_CHAIN_ID});}
export async function trophyPublic(code:string){await issueTrophies();const t=await db().prepare('SELECT t.code,t.category,t.issued,t.revoked,t.reason,t.round_id,t.tx_hash,t.token_id,r.title,e.name FROM trophies t JOIN rounds r ON r.id=t.round_id JOIN entries e ON e.id=t.entry_id WHERE t.code=?').bind(code).first();return t?json(t):failure('not_found',404);}
export async function trophyMetadata(code:string){
 const t=await db().prepare('SELECT code,category,issued,revoked FROM trophies WHERE code=?').bind(code).first<{code:string;category:string;issued:number;revoked:number}>();
 return t?json({name:'Tune Arena '+t.category+' trophy',description:'Verified round trophy. Verify its current status with the public code.',external_url:'/trophies/'+code,attributes:[{trait_type:'Verification code',value:code},{trait_type:'Category',value:t.category},{trait_type:'Status',value:t.revoked?'revoked':'active'}]}):failure('not_found',404);
}
async function rpc(method:string,params:unknown[]){const response=await fetch(evm.NFT_RPC_URL!,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});const body=await response.json() as any;if(!response.ok||body.error)throw new Error('nft_rpc_error');return body.result;}
export async function trophyAction(req:Request,user:string,code:string,action:string){
 const admin=await isAdministrator(user);const t=await db().prepare('SELECT * FROM trophies WHERE code=?').bind(code).first<any>();if(!t)return failure('not_found',404);
 if(t.owner!==user&&!admin)return failure('forbidden',403);
 const p=await req.json().catch(()=>null) as any;if(!p)return failure('invalid_data');
 if(action==='revoke'&&admin&&typeof p.reason==='string'&&p.reason.trim().length>0&&p.reason.length<=300){await db().batch([db().prepare('UPDATE trophies SET revoked=1,reason=? WHERE code=?').bind(p.reason.trim(),code),audit(user,'trophy_revoked',code,p.reason.trim())]);return json({ok:true});}
 if(action==='wallet'&&t.owner===user&&/^0x[a-fA-F0-9]{40}$/.test(p.wallet??'')&&p.consent===true&&!t.tx_hash){await db().prepare('UPDATE trophies SET wallet=? WHERE code=? AND revoked=0 AND tx_hash=\'\'').bind(p.wallet.toLowerCase(),code).run();return json({ok:true});}
 if(!evm.NFT_RPC_URL||!evm.NFT_CONTRACT||!evm.NFT_CHAIN_ID)return failure('nft_unconfigured',503);
 if(t.revoked||!t.wallet)return failure('ineligible_trophy',409);
 // Deterministic token ID encodes the public trophy code without any private identity.
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code)));const token='0x'+Array.from(hash,x=>x.toString(16).padStart(2,'0')).join('');
 if(action==='mint-intent'&&t.tx_hash)return failure('nft_already_minted',409);
 if(action==='mint-intent'&&admin)return json({chainId:'0x'+Number(evm.NFT_CHAIN_ID).toString(16),to:evm.NFT_CONTRACT,data:iface.encodeFunctionData('award',[t.wallet,token,origin(req)+'/api/trophies/'+code+'/metadata']),value:'0x0'});
 if(action==='confirm-mint'&&admin&&/^0x[a-fA-F0-9]{64}$/.test(p.txHash??'')){
 const chain=await rpc('eth_chainId',[]);if(Number(chain)!==Number(evm.NFT_CHAIN_ID))return failure('wrong_chain',409);
 const receipt=await rpc('eth_getTransactionReceipt',[p.txHash]);if(!receipt||receipt.status!=='0x1'||receipt.to?.toLowerCase()!==evm.NFT_CONTRACT.toLowerCase())return failure('mint_unconfirmed',409);
 const height=await rpc('eth_blockNumber',[]);if(Number(height)-Number(receipt.blockNumber)<2)return failure('mint_unconfirmed',409);
 const valid=receipt.logs.some((log:any)=>{if(log.address?.toLowerCase()!==evm.NFT_CONTRACT!.toLowerCase())return false;try{const e=iface.parseLog(log);return e?.name==='Transfer'&&e.args[0]==='0x0000000000000000000000000000000000000000'&&e.args[1].toLowerCase()===t.wallet&&e.args[2]===BigInt(token);}catch{return false;}});
 if(!valid)return failure('mint_mismatch',409);
 await db().batch([db().prepare("UPDATE trophies SET tx_hash=?,token_id=? WHERE code=? AND tx_hash='' AND revoked=0").bind(p.txHash,BigInt(token).toString(),code),audit(user,'nft_verified',code,p.txHash)]);return json({ok:true});
 }
 return failure('forbidden',403);
}
