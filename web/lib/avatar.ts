import {config,db,failure,json} from './worker';
import {boundedForm,imageType,maxUpload} from './upload-image';

export async function saveAvatar(req:Request,user:string) {
 if(Number(req.headers.get('content-length')||0)>maxUpload+16000)return failure('invalid_image',413);
 const form=await boundedForm(req),file=form?.get('photo');
 if(!(file instanceof File)||!file.size||file.size>maxUpload)return failure('invalid_image');
 const bytes=new Uint8Array(await file.arrayBuffer()),type=imageType(bytes);
 if(!type)return failure('invalid_image');
 const old=await db().prepare('SELECT id FROM avatars WHERE owner=?').bind(user).first<{id:string}>();
 const id=crypto.randomUUID(),key='avatars/'+id;
 await config.BUCKET.put(key,bytes,{httpMetadata:{contentType:type}});
 try {await db().prepare(`INSERT INTO avatars(owner,id,updated) VALUES(?,?,unixepoch())
 ON CONFLICT(owner) DO UPDATE SET id=excluded.id,updated=excluded.updated`).bind(user,id).run();}
 catch(error){await config.BUCKET.delete(key).catch(()=>{});throw error;}
 if(old)await config.BUCKET.delete('avatars/'+old.id).catch(()=>{});
 return json({avatar:'/api/avatars/'+id});
}
export async function removeAvatar(user:string) {
 const old=await db().prepare('SELECT id FROM avatars WHERE owner=?').bind(user).first<{id:string}>();
 if(old){await db().prepare('DELETE FROM avatars WHERE owner=? AND id=?').bind(user,old.id).run();await config.BUCKET.delete('avatars/'+old.id).catch(()=>{});}
 return json({ok:true});
}
export async function avatarMedia(id:string) {
 if(!await db().prepare('SELECT id FROM avatars WHERE id=?').bind(id).first())return failure('not_found',404);
 const object=await config.BUCKET.get('avatars/'+id);
 if(!object)return failure('not_found',404);
 return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType??'image/jpeg','X-Content-Type-Options':'nosniff','Cache-Control':'no-store',"Content-Security-Policy":"default-src 'none'"}});
}
