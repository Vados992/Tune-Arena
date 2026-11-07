"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api, errorLabel } from "@/lib/client";
import { translate, type Text } from "@/lib/strings";
import type { Locale } from "@/lib/locale";
import SectionHeader, { useSectionLocale } from "./section-header";

type Round={id:string;title:string;kind:string;opens:number;closes:number;closed:number;announced:number;entries:number;notice:string;prize:string;winner_id?:string|null};
type Entry={id:string;name:string;photo:string;nickname:string|null;hidden:number;votes:number;dislikes:number};
type Event={action:string;target:string;created:number};
type Activity={action:string;round_id:string;entry:string;created:number;title:string;kind:string};
type VoteEvent={id:number;action:string;created:number;name:string;nickname:string|null};
type ListKey="entries"|"votes";
type Detail={round:Round;entries:Entry[];events:Event[];voteActivity:VoteEvent[];next:Record<ListKey,number|null>};
type Metrics={rounds:number;active:number;finished:number;winners:number;entries:number;votes:number;dislikes:number;profiles:number;premium:number};
type Overview={summary:Metrics;activity:Activity[]};
const stats: [keyof Metrics,Text][]=[["rounds","allRounds"],["active","activeRounds"],["finished","closedRounds"],["winners","winners"],["entries","realEntries"],["votes","votes"],["dislikes","dislike"],["profiles","registered"],["premium","active"]];
const activityLabels:Record<string,Text>={winner_announced:"publishedWinner",notice_updated:"roundNotice",vote_added:"voteAdded",vote_removed:"voteRemoved",dislike_added:"dislikeAdded",dislike_removed:"dislikeRemoved",entry_submitted:"entrySubmitted",round_started:"roundStarted",round_finished:"roundFinished"};
function mergeById<T extends {id:string|number}>(first:T[],next:T[]) {
  return [...new Map([...first,...next].map(item=>[item.id,item])).values()];
}

export default function AdminPanel({initialLanguage}:{initialLanguage:Locale}) {
  const [locale,setLocale]=useSectionLocale(initialLanguage);
  const [rounds,setRounds]=useState<Round[]>([]),[selected,setSelected]=useState("");
  const [roundsNext,setRoundsNext]=useState<number|null>(null);
  const [detail,setDetail]=useState<Detail|null>(null),[notice,setNotice]=useState("");
  const [overview,setOverview]=useState<Overview|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState<Text|null>(null);
  const [ready,setReady]=useState(false);
  const detailVersion=useRef(0);
  const t=(key:Text)=>translate(locale,key);

  const load=useCallback(async(offset=0)=>{
    const r=await api<{rounds:Round[];next:number|null}>("admin/rounds?offset="+offset);
    setRounds(prev=>offset?mergeById(prev,r.rounds):r.rounds);setRoundsNext(r.next);setReady(true);
    setSelected(prev=>prev||r.rounds[0]?.id||"");
  },[]);
  const loadOverview=useCallback(async()=>{setOverview(await api<Overview>("admin/overview"));},[]);
  const loadDetail=useCallback(async(id:string,keepNotice=false)=>{
    const version=++detailVersion.current;
    const r=await api<Detail>("admin/rounds/"+id);
    if (version===detailVersion.current) {
      setDetail(r);
      if (!keepNotice) setNotice(r.round.notice);
    }
  },[]);
  useEffect(()=>{
    void Promise.all([load(),loadOverview()]).catch(e=>setError(errorLabel(e)));
    const timer=window.setInterval(()=>void loadOverview().catch(()=>{}),10000);
    return ()=>clearInterval(timer);
  },[load,loadOverview]);
  useEffect(()=>{
    setDetail(null);
    if (selected) void loadDetail(selected).catch(e=>setError(errorLabel(e)));
  },[selected,loadDetail]);
  const finished=detail?.round.closed;
  const recentlyClosed=overview?.activity.some(event=>event.round_id===selected&&event.action==="round_finished");
  useEffect(()=>{
    if (selected&&finished===0&&recentlyClosed) void loadDetail(selected,true).catch(e=>setError(errorLabel(e)));
  },[selected,finished,recentlyClosed,loadDetail]);

  async function execute(action:()=>Promise<void>){
    setBusy(true);setError(null);
    try {await action();}
    catch (e){setError(errorLabel(e));}
    finally {setBusy(false);}
  }
  async function announce(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const form=event.currentTarget,f=new FormData(form);
    await execute(async()=>{
      const result=await api<{id:string}>("admin/rounds","POST",{
        title:f.get("title"),notice:f.get("notice"),prize:f.get("prize"),minutes:Number(f.get("minutes")),
      });
      await Promise.all([load(),loadOverview()]);setSelected(result.id);form.reset();
    });
  }
  function change(path:string,data?:object){
    void execute(async()=>{
      await api("admin/rounds/"+selected+"/"+path,"POST",data);
      await Promise.all([load(),loadDetail(selected),loadOverview()]);
    });
  }
  function more(key:ListKey) {
    const offset=detail?.next[key];
    if (offset==null) return;
    const id=selected;
    void execute(async()=>{
      const page=await api<Detail>("admin/rounds/"+id+"?"+key+"="+offset);
      setDetail(old=>{
        if (!old||old.round.id!==id) return old;
        return {...old,
          entries:key==="entries"?mergeById(old.entries,page.entries):old.entries,
          voteActivity:key==="votes"?mergeById(old.voteActivity,page.voteActivity):old.voteActivity,
          next:{...old.next,[key]:page.next[key]}};
      });
    });
  }

  const winner=detail?.entries.find(e=>e.id===detail.round.winner_id);
  const date=(epoch:number)=>new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short"}).format(epoch*1000);
  const title=(r:{title:string;kind:string})=>r.title||t(r.kind==="test"?"test":"weekly");
  const inCatalogue=rounds.some(r=>r.id===selected);
  function eventLabel(action:string) {
    const label=activityLabels[action];
    if (label) return t(label);
    return t("feed")+" · "+t(action.endsWith("_hidden")?"hidden":"restore");
  }

  return <div className="shell">
    <SectionHeader locale={locale} change={setLocale} area="admin"/>
    <main className="admin">
      <div className="panel-header">
        <div><p className="eyebrow">TUNE ARENA / RACE CONTROL</p><h1>{t("adminHeading")}</h1></div>
        <button className="outline" disabled={busy} onClick={()=>void execute(async()=>{
          await Promise.all([load(),loadOverview(),selected?loadDetail(selected,true):Promise.resolve()]);
        })}>{t("refresh")}</button>
      </div>
      {error&&<p className="notice" role="alert">{t(error)}</p>}
      <section className="panel">
        <h2>{t("overview")}</h2>
        {overview?<dl className="metrics">{stats.map(([name,label])=><div key={name}>
          <dt>{t(label)}</dt><dd>{new Intl.NumberFormat(locale).format(overview.summary[name])}</dd>
        </div>)}</dl>:<p>{t("load")}</p>}
      </section>
      <details className="panel control-panel" open>
        <summary>{t("activity")}</summary>
        {overview?.activity.length ? <ul className="activity-list">{overview.activity.map((event,i)=><li key={event.round_id+event.action+i}>
          <time dateTime={new Date(event.created*1000).toISOString()}>{date(event.created)}</time>
          <button type="button" className="text-button" onClick={()=>{setSelected(event.round_id);document.getElementById("round-catalogue")?.scrollIntoView();}}>{title(event)}</button>
          <span>{eventLabel(event.action)}{event.entry?" · "+event.entry:""}</span>
        </li>)}</ul> : <p>{t(overview?"nothing":"load")}</p>}
      </details>
      <details className="panel control-panel">
        <summary>{t("announceRound")}</summary>
        <form className="admin-form" onSubmit={announce}>
          <label>{t("roundTitle")}<input name="title" maxLength={65} required/></label>
          <label>{t("roundPrize")}<input name="prize" maxLength={80}/></label>
          <label className="full">{t("roundNotice")}<textarea name="notice" maxLength={200} rows={2}/></label>
          <label>{t("duration")}<input name="minutes" type="number" min={1} max={43200} defaultValue={10080} required/></label>
          <button className="primary" disabled={busy}>{t("announceRound")}</button>
        </form>
      </details>
      <section id="round-catalogue" className="panel control-panel">
        <h2>{t("catalogue")}</h2>
        {rounds.length>0 ? <select className="catalog-select" aria-label={t("catalogue")} value={selected} onChange={e=>setSelected(e.target.value)}>
          {!inCatalogue&&selected&&<option value={selected}>{detail?title(detail.round):t("load")}</option>}
          {rounds.map(r=><option value={r.id} key={r.id}>{title(r)} · {date(r.opens)} · {r.entries} {t("feed").toLowerCase()}</option>)}
        </select> : <p>{t(ready?"nothing":"load")}</p>}
        {roundsNext!=null&&<button className="outline list-more" disabled={busy} onClick={()=>void execute(()=>load(roundsNext))}>{t("more")}</button>}
        {detail&&<>
          <div className="catalog-summary">
            <div><strong>{title(detail.round)}</strong><small>{date(detail.round.closes)} · {t(detail.round.closed?"finished":"open")}</small></div>
            <a className="outline" href={"/?round="+encodeURIComponent(selected)}>{t("openRound")}</a>
          </div>
          <form className="admin-form notice-form" onSubmit={e=>{e.preventDefault();change("notice",{notice});}}>
            <label>{t("roundNotice")}<input value={notice} onChange={e=>setNotice(e.target.value)} maxLength={200}/></label>
            <button className="outline" disabled={busy}>{t("save")}</button>
          </form>
          {detail.round.closed===1&&<div className="catalog-summary">
            <div><span className="eyebrow">{t("resultAuto")}</span><strong>{winner?winner.name+" · "+winner.votes+" "+t("votes"):t("none")}</strong></div>
            {winner&&(detail.round.announced ? <span className="state">{t("publishedWinner")}</span> :
              <button className="primary" disabled={busy} onClick={()=>change("announce")}>{t("announceWinner")}</button>)}
          </div>}
          <h3 className="subheading">{t("feed")} / {t("votes")}</h3>
          {detail.entries.length===0&&<p>{t("nothing")}</p>}
          <ul className="catalog-list">{detail.entries.map(e=><li key={e.id}>
            <img src={e.photo} alt="" loading="lazy"/>
            <div><strong>{e.name}</strong><small>{e.nickname?"@"+e.nickname+" · ":""}{e.votes} {t("votes")} · {e.dislikes} {t("dislike")}{e.hidden?" · "+t("hidden"):""}</small></div>
            {!detail.round.closed&&<button className="outline" disabled={busy} onClick={()=>change("entries/"+e.id,{hidden:!e.hidden})}>{t(e.hidden?"restore":"hide")}</button>}
          </li>)}</ul>
          {detail.next.entries!=null&&<button className="outline list-more" disabled={busy} onClick={()=>more("entries")}>{t("more")}</button>}
          <h3 className="subheading">{t("voteLog")}</h3>
          {detail.voteActivity.length===0&&<p>{t("nothing")}</p>}
          <ul className="activity-list">{detail.voteActivity.map(e=><li key={e.id}>
            <time dateTime={new Date(e.created*1000).toISOString()}>{date(e.created)}</time>
            <strong>{e.name}</strong><span>{eventLabel(e.action)}{e.nickname?" · @"+e.nickname:""}</span>
          </li>)}</ul>
          {detail.next.votes!=null&&<button className="outline list-more" disabled={busy} onClick={()=>more("votes")}>{t("more")}</button>}
          {detail.events.length>0&&<details className="activity"><summary>{t("history")}</summary><ul>{detail.events.map((e,i)=><li key={e.target+i}>{date(e.created)} · {eventLabel(e.action)}</li>)}</ul></details>}
        </>}
      </section>
    </main>
  </div>;
}
