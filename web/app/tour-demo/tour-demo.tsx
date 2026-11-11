'use client';
import {useEffect,useState} from 'react';
import {Timer,Trophy,Send} from 'lucide-react';
import {useSectionLocale} from '../section-header';
import {translate,type Text} from '@/lib/strings';
import type {Locale} from '@/lib/locale';
export default function TourDemo({initialLanguage,epoch}:{initialLanguage:Locale;epoch:number}){
  const [locale]=useSectionLocale(initialLanguage),t=(key:Text)=>translate(locale,key);
  const [now,setNow]=useState(epoch),[message,setMessage]=useState<Text|null>(null);
  useEffect(()=>{const start=Date.now();const timer=setInterval(()=>setNow(epoch+Math.floor((Date.now()-start)/1000)),1000);return()=>clearInterval(timer);},[epoch]);
  const boundary=Math.floor(epoch/3600)*3600;
  const tours=[
    {id:'completed',title:'demoPastName' as Text,opens:boundary-3*86400,closes:boundary-86400},
    {id:'current',title:'nightNeon' as Text,opens:boundary-86400,closes:boundary+86400},
    {id:'next',title:'demoNextName' as Text,opens:boundary+86400,closes:boundary+3*86400},
  ];
  const date=(seconds:number)=>new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Lisbon'}).format(seconds*1000);
  const countdown=(seconds:number)=>[Math.floor(seconds/86400),Math.floor(seconds/3600)%24,Math.floor(seconds/60)%60,seconds%60].map(v=>String(v).padStart(2,'0')).join(':');
  async function share(){
    const url=new URL('/tour-demo',location.origin).href;
    if(navigator.share){try{await navigator.share({title:t('demoTours'),url});}catch(error){if(!(error instanceof Error&&error.name==='AbortError'))setMessage('error');}}
    else try{await navigator.clipboard.writeText(url);setMessage('copied');}catch{setMessage('error');}
  }
  return <div className="shell"><header className="header"><a href="/" className="brand"><span className="mark">T</span>TUNE<span className="brand-accent">ARENA</span></a><a href="/?tour=1" className="outline">{t('uploadBack')}</a></header>
    <main className="demo-tours"><h1>{t('demoTours')}</h1><p className="notice">{t('demoToursHint')}</p>
      {tours.map(tour=>{const ended=now>=tour.closes,scheduled=now<tour.opens;return <section className="tour-banner" key={tour.id} data-demo-tour={tour.id}>
        <span className="eyebrow">{t(scheduled?'tourScheduled':ended?'tourEnded':'tourCurrent')}</span><h2>{t(tour.title)}</h2>
        <p>{t('tourStarts')}: <time dateTime={new Date(tour.opens*1000).toISOString()}>{date(tour.opens)}</time></p>
        <p>{t('tourEnds')}: <time dateTime={new Date(tour.closes*1000).toISOString()}>{date(tour.closes)}</time></p>
        <div className="tour-banner-meta"><span className="tour-prize"><Trophy size={17}/>{t('demoPrize')} · 100 USDT</span><span className="tour-countdown"><Timer size={17}/><strong>{ended?t('tourEnded'):countdown(Math.max(0,(scheduled?tour.opens:tour.closes)-now))}</strong></span></div>
        {scheduled&&<p>{t('demoStartsIn')}</p>}{!ended&&!scheduled&&<button className="outline tour-share" onClick={()=>void share()}><Send size={17}/>{t('tourShare')}</button>}
      </section>;})}
      {message&&<p className="notice" role="status">{t(message)}</p>}
    </main></div>;
}
