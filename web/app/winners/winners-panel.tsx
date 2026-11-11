"use client";
import { useEffect, useState } from "react";
import { api, errorLabel } from "@/lib/client";
import { translate, type Text } from "@/lib/strings";
import type { Locale } from "@/lib/locale";
import SectionHeader, { useSectionLocale } from "../section-header";

type Winner={id:string;name:string;nickname:string|null;votes:number;photo:string};
type PodiumEntry={id:string;name:string;nickname:string|null;place:number;points:number};
type Outcome={podium?:{popular:PodiumEntry[];overall:PodiumEntry[]};id:string;title:string;kind:string;closedAt:number;prize:string;announced:number;winner:Winner|null;charged:boolean;rewardGranted:boolean;overallWinner:{id:string;name:string;nickname:string|null;score:number}|null};
type Results={rounds:Outcome[];next:number|null};

export default function WinnersPanel({initialLanguage}:{initialLanguage:Locale}) {
  const [locale,setLocale]=useSectionLocale(initialLanguage);
  const [offset,setOffset]=useState(0),[results,setResults]=useState<Results|null>(null);
  const [error,setError]=useState<Text|null>(null);
  const t=(key:Text)=>translate(locale,key);
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
  const date=(seconds:number)=>new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Lisbon"}).format(seconds*1000);
  const move=(next:number)=>{setResults(null);setOffset(next);};
  const podium=(r:Outcome):PodiumEntry[]=>r.podium?.overall?.length?r.podium.overall:r.overallWinner?[{...r.overallWinner,place:1,points:r.overallWinner.score}]:r.winner?[{...r.winner,place:1,points:r.winner.votes}]:[];
  const pastRounds=(results?.rounds??[]).filter(r=>r.kind==="weekly"&&r.closedAt<=Date.now()/1000&&podium(r).length>0).sort((a,b)=>b.closedAt-a.closedAt||b.id.localeCompare(a.id));
  return <div className="shell">
    <SectionHeader locale={locale} change={setLocale} area="winners"/>
    <main>
      <div className="panel-header">
        <div><p className="eyebrow">TUNE ARENA / HALL OF FAME</p><h1>{t("winners")}</h1></div>

      </div>
      {error&&<p className="notice" role="alert">{t(error)}</p>}
      {!error&&!results&&<p className="notice">{t("load")}</p>}
      {results&&pastRounds.length===0&&<p className="notice">{t("noResults")}</p>}
      <div className="past-rounds">{pastRounds.map(r=><article className="panel past-round" key={r.id} aria-label={r.title||t("weekly")}>
        <header className="past-round-heading"><div><span className="eyebrow">{t("winnerRound")}</span><h2>{r.title||t("nightNeon")}</h2></div><time dateTime={new Date(r.closedAt*1000).toISOString()}>{date(r.closedAt)}</time></header>
        <ol className="winner-prize-list">{podium(r).map(e=><li className={"winner-prize-place place-"+e.place} key={e.id}>
          <span className="winner-medal" aria-hidden="true">{["🥇","🥈","🥉"][e.place-1]}</span>
          <div><span className="eyebrow">{e.place===1?t("winnerRound"):e.place+" · "+t("place")}</span><h3>{e.nickname?"@"+e.nickname:e.name}</h3>{e.nickname&&<p>{e.name}</p>}<p className="winner-prize"><strong>{t("winnerPrize")}:</strong> {e.place===1&&r.prize?r.prize:t("winnerPrizePending")}</p></div>
        </li>)}</ol>
      </article>)}</div>
      {(offset>0||results?.next!=null)&&<div className="actions">
        {offset>0&&<button className="outline" onClick={()=>move(Math.max(0,offset-30))}>{t("previous")}</button>}
        {results?.next!=null&&<button className="outline" onClick={()=>move(results.next!)}>{t("next")}</button>}
      </div>}
    </main>
  </div>;
}
