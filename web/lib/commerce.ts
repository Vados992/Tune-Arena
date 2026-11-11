import {db,json,failure,config,origin,isAdministrator} from './worker';
import {httpsURL,textValue,integer,verifyStripeSignature} from './commerce-utils';
export type Product={id:string;name:string;kind:string;amount:number;currency:string;stock:number;duration:number;shipping_minor:number;active:number};
export type Order={product_id:string;id:string;owner:string;name:string;kind:string;amount:number;currency:string;quantity:number;duration:number;round_id:string|null;entry_id:string|null;state:string;payment_method:string;provider_session:string|null;payment_intent:string;external_reference:string;created:number;expires:number};
const env=config as typeof config&{STRIPE_SECRET_KEY?:string;STRIPE_WEBHOOK_SECRET?:string;COMMERCE_SELLER_NAME?:string};
const redeemable="(round_id IS NULL OR EXISTS(SELECT 1 FROM rounds r JOIN entries e ON e.id=commerce_orders.entry_id WHERE r.id=commerce_orders.round_id AND r.closes>unixepoch() AND e.withdrawn=0 AND (commerce_orders.kind<>'retry' OR (e.moderation_state='rejected' AND coalesce(r.submission_closes,r.closes)>unixepoch()))))";
const kinds=['premium','priority','slot','retry','pin','merch'];
export const audit=(actor:string,action:string,target:string,reference='')=>db().prepare('INSERT INTO commerce_audit(id,actor,action,target,reference,created) VALUES(?,?,?,?,?,unixepoch())').bind(crypto.randomUUID(),actor,action,target,reference);
export async function expireOrders(){await db().prepare("UPDATE commerce_orders SET state='expired' WHERE state='pending' AND expires<=unixepoch()").run();}
export async function stripe(path:string,method='GET',body?:URLSearchParams,key?:string){
 const response=await fetch('https://api.stripe.com/v1/'+path,{method,headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(key?{'Idempotency-Key':key}:{})},body:body?.toString()});
 const result=await response.json() as Record<string,any>;
 if(!response.ok)throw new Error('payment_provider_error');return result;
}
export async function sellerName(){return env.COMMERCE_SELLER_NAME??(await db().prepare("SELECT value FROM commerce_settings WHERE key='seller'").first<{value:string}>())?.value??null;}
export async function catalogRoute(user:string|null){
 await expireOrders();
 const products=await db().prepare('SELECT * FROM products WHERE active=1 ORDER BY kind,name').all();
 const orders=user?await db().prepare('SELECT * FROM commerce_orders WHERE owner=? ORDER BY created DESC,rowid DESC LIMIT 80').bind(user).all():{results:[]};
 const rights=user?await db().prepare('SELECT * FROM commerce_entitlements WHERE owner=? AND revoked=0 AND ends>unixepoch()').bind(user).all():{results:[]};
 return json({products:products.results,orders:orders.results,entitlements:rights.results,signedIn:!!user,seller:await sellerName(),paymentsReady:!!env.STRIPE_SECRET_KEY&&!!env.STRIPE_WEBHOOK_SECRET&&!!await sellerName()});
}
export async function createOrder(req:Request,user:string){
 const p=await req.json().catch(()=>null) as Record<string,any>|null;
 if(!p||!textValue(p.requestKey,80)||!/^[-a-zA-Z0-9]{8,80}$/.test(p.requestKey)||!integer(p.quantity??1,1,10)||!['invoice','stripe'].includes(p.method))return failure('invalid_order');
 await expireOrders();
 const previous=await db().prepare('SELECT * FROM commerce_orders WHERE owner=? AND request_key=?').bind(user,p.requestKey).first<Order>();
 if(previous)return previous.product_id===p.productId&&previous.quantity===(p.quantity??1)&&previous.payment_method===p.method&&(previous.entry_id??'')===(p.entryId??'')?json({order:previous}):failure('idempotency_conflict',409);
 const product=await db().prepare('SELECT * FROM products WHERE id=? AND active=1').bind(String(p.productId??'')).first<Product>();
 if(!product)return failure('unavailable_product',409);
 if(p.method==='stripe'&&(!env.STRIPE_SECRET_KEY||!env.STRIPE_WEBHOOK_SECRET||!await sellerName()))return failure('payments_unconfigured',503);
 if(!await sellerName())return failure('seller_unconfigured',503);
 const quantity=p.quantity??1;
 let round:string|null=null,entry:string|null=null;
 if(product.kind!=='merch'&&quantity!==1)return failure('invalid_order');
 if(!['premium','merch'].includes(product.kind)){
  const target=await db().prepare(`SELECT e.id,e.round_id,e.hidden,e.moderation_state,r.closes,coalesce(r.submission_closes,r.closes) AS deadline,unixepoch() AS clock
   FROM entries e JOIN rounds r ON r.id=e.round_id WHERE e.id=? AND e.owner=? AND e.withdrawn=0 AND e.superseded_by IS NULL AND r.kind='weekly'`)
   .bind(String(p.entryId??''),user).first<{id:string;round_id:string;hidden:number;moderation_state:string;closes:number;deadline:number;clock:number}>();
  if(!target||target.clock>=target.closes)return failure('ineligible_entry',409);
  if(product.kind==='retry'?(target.moderation_state!=='rejected'||target.clock>=target.deadline):product.kind==='priority'?target.moderation_state==='rejected':target.hidden===1)return failure('ineligible_entry',409);
  round=target.round_id;entry=target.id;
 }
 const address=product.kind==='merch'?textValue(p.shippingAddress,1500):'';if(product.kind==='merch'&&!address)return failure('shipping_required');
 const id=crypto.randomUUID();
 try{await db().batch([db().prepare(`INSERT INTO commerce_orders(id,owner,request_key,product_id,name,kind,amount,currency,quantity,duration,round_id,entry_id,payment_method,created,expires)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,unixepoch(),unixepoch()+86400)`).bind(id,user,p.requestKey,product.id,product.name,product.kind,product.amount*quantity+product.shipping_minor,product.currency,quantity,product.duration,round,entry,p.method),...(address?[db().prepare('INSERT INTO order_shipping VALUES(?,?)').bind(id,address)]:[])]);}
 catch(e){const existing=await db().prepare('SELECT * FROM commerce_orders WHERE owner=? AND request_key=?').bind(user,p.requestKey).first();if(existing)return json({order:existing});if(/unavailable_product/.test(String(e)))return failure('unavailable_product',409);throw e;}
 await audit(user,'order_created',id).run();
 return json({order:await db().prepare('SELECT * FROM commerce_orders WHERE id=?').bind(id).first()},201);
}
export async function checkout(req:Request,user:string,id:string){
 await expireOrders();
 const order=await db().prepare('SELECT * FROM commerce_orders WHERE id=? AND owner=?').bind(id,user).first<Order>();
 if(!order)return failure('not_found',404);
 if(!env.STRIPE_SECRET_KEY||!env.STRIPE_WEBHOOK_SECRET||!await sellerName())return failure('payments_unconfigured',503);
 if(order.state!=='pending'||order.payment_method!=='stripe')return failure('invalid_order_state',409);
 if(order.provider_session){const session=await stripe('checkout/sessions/'+order.provider_session);return session.status==='open'?json({url:session.url}):failure('checkout_not_open',409);}
 const body=new URLSearchParams({mode:'payment',client_reference_id:id,'metadata[order_id]':id,'line_items[0][price_data][currency]':order.currency,'line_items[0][price_data][unit_amount]':String(order.amount),'line_items[0][price_data][product_data][name]':order.name,'line_items[0][quantity]':'1',success_url:origin(req)+'/shop?order='+id,cancel_url:origin(req)+'/shop?order='+id});
 if(order.kind==='merch')for(const [i,c]of ['PT','ES','FR','DE','IT','NL','BE','IE','AT','PL'].entries())body.set(`shipping_address_collection[allowed_countries][${i}]`,c);
 const session=await stripe('checkout/sessions','POST',body,'checkout-'+id);
 await db().prepare("UPDATE commerce_orders SET provider_session=? WHERE id=? AND state='pending' AND provider_session IS NULL").bind(session.id,id).run();
 return json({url:session.url});
}
export async function paymentWebhook(req:Request){
 if(!env.STRIPE_WEBHOOK_SECRET||!env.STRIPE_SECRET_KEY)return failure('payments_unconfigured',503);
 if(Number(req.headers.get('content-length')??0)>262144)return failure('invalid_webhook',413);
 const raw=await req.text();if(raw.length>262144||!await verifyStripeSignature(raw,req.headers.get('stripe-signature')??'',env.STRIPE_WEBHOOK_SECRET))return failure('invalid_webhook',400);
 let event:any;try{event=JSON.parse(raw);}catch{return failure('invalid_webhook');}
 if(!['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','charge.refunded','charge.dispute.created'].includes(event.type))return json({ok:true});
 if(await db().prepare('SELECT id FROM payment_events WHERE id=?').bind(event.id).first())return json({ok:true});
 if(event.type.startsWith('checkout.')){
  const session=await stripe('checkout/sessions/'+encodeURIComponent(event.data.object.id));
  const order=await db().prepare('SELECT * FROM commerce_orders WHERE id=? AND provider_session=?').bind(session.client_reference_id??'',session.id).first<Order>();
  if(!order||order.amount!==session.amount_total||order.currency!==session.currency||session.metadata?.order_id!==order.id)return failure('payment_mismatch',409);
  if(session.payment_status!=='paid')return json({ok:true});
  await db().batch([
   db().prepare(`UPDATE commerce_orders SET state=CASE WHEN expires>unixepoch() AND ${redeemable} THEN 'paid' ELSE 'refund_pending' END,paid_at=unixepoch(),payment_intent=? WHERE id=? AND state='pending'`).bind(session.payment_intent??'',order.id),
   db().prepare("UPDATE commerce_orders SET state='refund_pending',payment_intent=? WHERE id=? AND state IN ('expired','cancelled')").bind(session.payment_intent??'',order.id),
   db().prepare('INSERT OR IGNORE INTO payment_events VALUES(?,?,unixepoch())').bind(event.id,event.type),audit('stripe','payment_received',order.id,event.id),
  ]);
 }else{
  const charge=event.type==='charge.refunded'?event.data.object:await stripe('charges/'+event.data.object.charge);
  const state=event.type==='charge.refunded'&&charge.refunded?'refunded':'disputed';
  await db().batch([db().prepare("UPDATE commerce_orders SET state=? WHERE payment_intent=? AND state IN ('paid','shipped','completed','refund_pending')").bind(state,charge.payment_intent??''),db().prepare('INSERT OR IGNORE INTO payment_events VALUES(?,?,unixepoch())').bind(event.id,event.type)]);
 }
 return json({ok:true});
}
export async function orderAction(req:Request,user:string,id:string,action:string){
 const order=await db().prepare('SELECT * FROM commerce_orders WHERE id=? AND owner=?').bind(id,user).first<Order>();if(!order)return failure('not_found',404);
 if(action==='cancel'){await db().prepare("UPDATE commerce_orders SET state='cancelled' WHERE id=? AND state='pending'").bind(id).run();return json({ok:true});}
 if(action==='refund'){const body=await req.json().catch(()=>({})) as any;const reason=textValue(body.reason,500);if(!reason)return failure('refund_reason_required');
 const result=await db().prepare("UPDATE commerce_orders SET state='refund_pending',refund_reason=? WHERE id=? AND state IN ('paid','shipped','completed')").bind(reason,id).run();
 return result.meta.changes?json({ok:true}):failure('invalid_order_state',409);}
 return failure('not_found',404);
}
export async function commerceAdmin(req:Request,user:string,path:string[]){
 if(!await isAdministrator(user))return failure('forbidden',403);
 await expireOrders();const [section,id,action]=path;
 if(req.method==='GET'&&section==='orders'&&id)return json({order:await db().prepare('SELECT * FROM commerce_orders WHERE id=?').bind(id).first(),shipping:await db().prepare('SELECT address FROM order_shipping WHERE order_id=?').bind(id).first()});
 if(req.method==='GET')return json({products:(await db().prepare('SELECT * FROM products ORDER BY created DESC').all()).results,orders:(await db().prepare('SELECT * FROM commerce_orders ORDER BY created DESC LIMIT 100').all()).results,audit:(await db().prepare('SELECT * FROM commerce_audit ORDER BY created DESC LIMIT 80').all()).results,ready:!!env.STRIPE_SECRET_KEY&&!!env.STRIPE_WEBHOOK_SECRET,seller:await sellerName()});
 const p=await req.json().catch(()=>null) as any;if(!p)return failure('invalid_data');
 if(section==='settings'){const seller=textValue(p.seller,200);if(!seller)return failure('seller_required');await db().prepare("INSERT INTO commerce_settings VALUES('seller',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(seller).run();return json({ok:true});}
 if(section==='products'){
 const name=textValue(p.name,100),description=textValue(p.description,1000),terms=textValue(p.terms,2000),image=httpsURL(p.image),variant=textValue(p.variant,80);
 if(!name||description===null||terms===null||image===null||variant===null||!kinds.includes(p.kind)||!integer(p.amount,0,10000000)||!integer(p.stock,-1,1000000)||!integer(p.duration,60,31536000)||!integer(p.shippingMinor??0,0,1000000)||!['eur','usd','gbp'].includes(p.currency)||typeof p.active!=='boolean'||p.active&&!terms)return failure('invalid_product');
 const key=id??crypto.randomUUID();await db().batch([db().prepare(`INSERT INTO products(id,name,kind,description,image,variant,amount,currency,stock,duration,active,shipping_minor,terms,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,unixepoch())
 ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,image=excluded.image,variant=excluded.variant,amount=excluded.amount,currency=excluded.currency,stock=excluded.stock,duration=excluded.duration,active=excluded.active,shipping_minor=excluded.shipping_minor,terms=excluded.terms`)
 .bind(key,name,p.kind,description,image,variant,p.amount,p.currency,p.stock,p.duration,Number(p.active),p.shippingMinor??0,terms),audit(user,'product_saved',key)]);return json({id:key});
 }
 if(section==='orders'&&id){
 const order=await db().prepare('SELECT * FROM commerce_orders WHERE id=?').bind(id).first<Order>();if(!order)return failure('not_found',404);
 const ref=textValue(p.reference,180);if(!ref)return failure('reference_required');
 if(action==='confirm'){
 if(order.payment_method!=='invoice'||order.state!=='pending')return failure('invalid_order_state',409);
 const result=await db().batch([db().prepare(`UPDATE commerce_orders SET state=CASE WHEN ${redeemable} THEN 'paid' ELSE 'refund_pending' END,paid_at=unixepoch(),external_reference=? WHERE id=? AND state='pending' AND expires>unixepoch()`).bind(ref,id),audit(user,'invoice_verified',id,ref)]);
 return result[0].meta.changes?json({ok:true}):failure('order_expired',409);
 }
 if(action==='ship'&&order.kind==='merch'&&order.state==='paid'){await db().batch([db().prepare("UPDATE commerce_orders SET state='shipped',tracking=? WHERE id=? AND state='paid'").bind(ref,id),audit(user,'order_shipped',id,ref)]);return json({ok:true});}
 if(action==='refund'&&['refund_pending','disputed','paid','shipped','completed'].includes(order.state)){
 if(order.payment_intent){const refund=await stripe('refunds','POST',new URLSearchParams({payment_intent:order.payment_intent}),'refund-'+id);if(refund.status!=='succeeded'){await db().prepare("UPDATE commerce_orders SET state='refund_pending' WHERE id=?").bind(id).run();return json({ok:true,pending:true});}}
 await db().batch([db().prepare("UPDATE commerce_orders SET state='refunded',external_reference=? WHERE id=? AND state<>'refunded'").bind(ref,id),audit(user,'order_refunded',id,ref)]);return json({ok:true});
 }
 }
 return failure('invalid_order_state',409);
}
