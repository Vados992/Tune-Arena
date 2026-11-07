"use client";
import { useCallback, useEffect, useState } from "react";
import { api, errorLabel } from "@/lib/client";
import { translate, type Text } from "@/lib/strings";
import type { Locale } from "@/lib/locale";
import SectionHeader, { useSectionLocale } from "../section-header";

type Winner={id:string;name:string;nickname:string|null;votes:number;photo:string};
type Outcome={id:string;title:string;kind:string;closedAt:number;prize:string;announced:number;winner:Winner|null};
type Results={rounds:Outcome[];next:number|null};

export default function WinnersPanel({initialLanguage}:{initialLanguage:Locale}) {
  const [locale,setLocale]=useSectionLocale(initialLanguage);
  const [offset,setOffset]=useState(0),[results,setResults]=useState<Results|null>(null);
  const [error,setError]=useState<Text|null>(null);
  const t=(key:Text)=>translate(locale,key);
  const refresh=useCallback(async()=>{
    const data=await api<Results>("winners?offset="+offset);
    setResults(data);setError(null);
  },[offset]);
  useEffect(()=>{
    let cancelled=false;
    async function load() {
      try {
        const data=await api<Results>("winners?offset="+offset);
        if (!cancelled) {setResults(data);setError(null);}
      } catch(e) {if (!cancelled) setError(errorLabel(e));}
    }
    void load();
    const timer=window.setInterval(()=>void load(),8000);
    return ()=>{cancelled=true;clearInterval(timer);};
  },[offset]);
  const date=(seconds:number)=>new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short"}).format(seconds*1000);
  const move=(next:number)=>{setResults(null);setOffset(next);};
  return <div className="shell">
    <SectionHeader locale={locale} change={setLocale} area="winners"/>
    <main>
      <div className="panel-header">
        <div><p className="eyebrow">TUNE ARENA / HALL OF FAME</p><h1>{t("winners")}</h1><p>{t("winnersIntro")}</p></div>
        <button className="outline" onClick={()=>void refresh().catch(e=>setError(errorLabel(e)))}>{t("refresh")}</button>
      </div>
      {error&&<p className="notice" role="alert">{t(error)}</p>}
      {!error&&!results&&<p className="notice">{t("load")}</p>}
      {results&&results.rounds.length===0&&<p className="notice">{t("noResults")}</p>}
      <div className="grid winners-grid">{results?.rounds.map(r=><article className="card result-card" key={r.id}>
        {r.winner&&<div className="card-image"><img src={r.winner.photo} alt={r.winner.name} loading="lazy"/>
          <span>{t(r.announced?"organizerAnnouncement":"resultAuto")}</span></div>}
        <div className="card-body">
          <span className="eyebrow">{r.title||t(r.kind==="test"?"test":"weekly")}</span>
          <h2>{r.winner?.name??t("none")}</h2>
          {r.winner&&<small>{r.winner.nickname?"@"+r.winner.nickname+" · ":""}{r.winner.votes} · {t("votes")}</small>}
          {r.prize&&<p>{t("ownerPrize")} · {r.prize}</p>}
          <small>{date(r.closedAt)}</small>
          <a className="winner-link" href={"/?round="+encodeURIComponent(r.id)}>{t("openRound")}</a>
        </div>
      </article>)}</div>
      {(offset>0||results?.next!=null)&&<div className="actions">
        {offset>0&&<button className="outline" onClick={()=>move(Math.max(0,offset-30))}>{t("previous")}</button>}
        {results?.next!=null&&<button className="outline" onClick={()=>move(results.next!)}>{t("next")}</button>}
      </div>}
    </main>
  </div>;
}
