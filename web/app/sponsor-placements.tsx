'use client';
import {useEffect,useRef,useState} from 'react';
import {api} from '@/lib/client';
type Campaign={id:string;title:string;brand:string;logo:string;link:string;promo:string;prize:string;period:string};
export default function SponsorPlacements({round}:{round?:string}){
 const [data,setData]=useState<{campaigns:Campaign[];posts:any[];entries:any[]}>({campaigns:[],posts:[],entries:[]});
 useEffect(()=>{let alive=true;Promise.all([api<any>('sponsors'+(round?'?round='+round:'')),api<any>('promotions'+(round?'?round='+round:''))]).then(([s,p])=>{if(alive)setData({...s,entries:p.entries});}).catch(()=>{});return()=>{alive=false;};},[round]);
 return <section className="sponsor-placements" aria-label="Партнёрские размещения">{data.campaigns.map(c=><SponsorCard key={c.id} campaign={c}/>)}
 {data.posts.map(p=><article key={p.id} className="panel native-sponsor"><span className="eyebrow">РЕКЛАМА · {p.brand}</span><h3>{p.title}</h3>{p.image&&<img className="commerce-photo" src={p.image} alt={p.title}/>}<p className="preserve-lines">{p.body}</p>{p.video&&<a href={p.video} target="_blank" rel="noreferrer">Смотреть ролик ↗</a>}</article>)}
 {data.entries.length>0&&<section className="panel"><span className="eyebrow">РЕКЛАМНАЯ ВИТРИНА · ПЛАТНОЕ РАЗМЕЩЕНИЕ</span><p>Эти показы не добавляют конкурсных баллов.</p><div className="promo-grid">{data.entries.map(p=><a key={p.id+p.kind} href={'/?round='+round}><img src={'/api/media/'+p.id} alt={p.name}/><strong>{p.name}</strong><small>{p.kind==='pin'?'Закреп':'Слот дайджеста'}</small></a>)}</div></section>}
 </section>;
}
export function SponsorCard({campaign:c}:{campaign:Campaign}){
 const el=useRef<HTMLElement>(null),event=useRef('');
 useEffect(()=>{event.current=crypto.randomUUID();if(!el.current||navigator.doNotTrack==='1')return;let timer:ReturnType<typeof setTimeout>|undefined,sent=false;
 const observer=new IntersectionObserver(items=>{if(items[0].isIntersecting&&items[0].intersectionRatio>=.5&&!sent){timer=setTimeout(()=>{sent=true;void api('sponsors/'+c.id+'/impression','POST',{eventId:event.current}).catch(()=>{});},1000);}else if(timer)clearTimeout(timer);},{threshold:[.5]});observer.observe(el.current);return()=>{observer.disconnect();if(timer)clearTimeout(timer);};},[c.id]);
 function track(kind:string){if(navigator.doNotTrack!=='1')void api('sponsors/'+c.id+'/'+kind,'POST',{eventId:event.current}).catch(()=>{});}
 return <article className="panel sponsor-banner" ref={el}><div>{c.logo&&<img src={c.logo} alt={c.brand}/>}<span className="eyebrow">РЕКЛАМА · СПОНСОР {c.period==='month'?'МЕСЯЦА':'НЕДЕЛИ'}</span><h3>{c.brand}</h3><p>{c.title}</p>{c.prize&&<p>Приз предоставлен {c.brand}: <strong>{c.prize}</strong></p>}</div><div className="actions">{c.link&&<a className="primary" href={c.link} target="_blank" rel="noreferrer" onClick={()=>track('click')}>К партнёру ↗</a>}{c.promo&&<button className="outline" onClick={()=>{track('promo');void navigator.clipboard.writeText(c.promo);}}>Промокод: {c.promo}</button>}</div></article>;
}
