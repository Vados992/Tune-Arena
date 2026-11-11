'use client';
import {useState} from 'react';
import {api,errorLabel} from '@/lib/client';
import {translate,type Text} from '@/lib/strings';
import type {Locale} from '@/lib/locale';
type Tour={id:string;title:string;opens:number;closes:number;prize:string};
type Page={rounds:Tour[];next:number|null;serverTime:number};
export default function TourList({locale}:{locale:Locale}){
 const t=(key:Text)=>translate(locale,key);
 const [page,setPage]=useState<Page|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<Text|null>(null);
 async function load(offset=0){if(busy)return;setBusy(true);setError(null);try{const result=await api<Page>('rounds?offset='+offset);setPage(old=>({...result,rounds:offset&&old?[...old.rounds,...result.rounds]:result.rounds}));}catch(e){setError(errorLabel(e));}finally{setBusy(false);}}
 const date=(time:number)=>new Intl.DateTimeFormat(locale,{timeZone:'Europe/Lisbon',dateStyle:'medium',timeStyle:'short'}).format(time*1000);
 return <details className="panel all-tours" onToggle={e=>{if(e.currentTarget.open&&!page&&!busy&&!error)void load();}}><summary>{t('allTours')}</summary>
 {busy&&<p role="status">{t('load')}</p>}{error&&<p role="alert">{t(error)} <button className="outline" onClick={()=>void load(page?.next??0)}>{t('again')}</button></p>}
 {page&&!page.rounds.length&&<p>{t('nothing')}</p>}
 <ul>{page?.rounds.map(r=><li key={r.id}><a href={'/?round='+encodeURIComponent(r.id)+'&tour=1'}><strong>{r.title||t('nightNeon')}</strong><span>{t(r.opens>page.serverTime?'tourScheduled':r.closes<=page.serverTime?'tourEnded':'tourCurrent')} · {t('tourStarts')}: {date(r.opens)}</span><span>{t('winnerPrize')}: {r.prize||t('winnerPrizePending')}</span></a></li>)}</ul>
 {page?.next!=null&&<button className="outline" disabled={busy} onClick={()=>void load(page.next!)}>{t('more')}</button>}
 </details>;
}
