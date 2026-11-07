"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { languages, language, type Locale } from "@/lib/locale";
import { translate, type Text } from "@/lib/strings";
import { api, errorLabel } from "@/lib/client";
import { frames, frameTitles, sampleGarage, workshop } from "@/lib/garage";
import ClubPanel, { ClubReward } from "./club-panel";
import type { Club } from "@/lib/referrals";
import { socialText } from "@/lib/social-strings";
import PhotoPicker from "./photo-picker";
import { Home, Flame, Trophy, UserRound, Users, Search, Plus, Heart, ThumbsDown, Send, ArrowUpRight, Timer, ShieldCheck, Camera, Crown, Flag, ChevronRight, X, Download } from "lucide-react";

type Credit={author:string;source:string;license:string;terms?:string};
type Entry={id:string;name:string;description:string;image:string;likes:number;liked:boolean;dislikes:number;disliked:boolean;mine:boolean;sample:boolean;frame:string;gift:number;nickname:string|null;created:number;credit?:Credit};
type Profile={nickname:string|null;premium:boolean;premiumUntil:number;trialUsed:boolean;frame:string;gift:boolean};
type Round={id:string;kind:string;closes:number;serverTime:number;closed:boolean;title:string;notice:string;prize:string;announced:number};
type Model={signedIn:boolean;admin?:boolean;providers:{email:boolean;telegram:boolean;chatgpt?:boolean;local?:boolean};round?:Round;
  winner?:{id:string;name:string;likes:number;nickname:string|null}|null;entries?:Entry[];profile?:Profile;club?:Club|null};
type Section="feed"|"top"|"profile";
type Modal="rules"|"entry"|"login"|"nickname";
const labels={en:"English",pt:"Português",es:"Español",ru:"Русский",uk:"Українська",fr:"Français"};
const navIcons={feed:Home,top:Flame,profile:UserRound};
const empty:Model={signedIn:false,providers:{email:false,telegram:false}};
const photoCredits=[...Object.values(sampleGarage),...workshop];
const fmt=(seconds:number)=>[Math.floor(seconds/86400),Math.floor(seconds/3600)%24,Math.floor(seconds/60)%60,seconds%60].map(x=>String(x).padStart(2,"0")).join(":");

export default function Arena({initialLanguage}:{initialLanguage:Locale}) {
  const [locale,setLocale]=useState(initialLanguage),[data,setData]=useState<Model>(empty);
  const [tab,setTab]=useState<Section>("feed"),[modal,setModal]=useState<Modal|null>(null);
  const [message,setMessage]=useState<Text|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [seconds,setSeconds]=useState(0),[confirm,setConfirm]=useState("");
  const [photo,setPhoto]=useState<File|null>(null),[photoBusy,setPhotoBusy]=useState(false);
  const [afterNickname,setAfterNickname]=useState<"entry"|null>(null);
  const roundId=useRef(""),nicknamePrompted=useRef(false);
  const referral=useRef("");
  const [returnTo,setReturnTo]=useState("/");
  const epoch=useRef({seconds:0,clock:0,closes:0});
  const sequence=useRef(0);
  const t=(key:Text)=>translate(locale,key);
  const st=socialText(locale);
  const [search,setSearch]=useState(""),[onlyMine,setOnlyMine]=useState(false),[sort,setSort]=useState("new");

  const load=useCallback(async ()=>{
    const seq=++sequence.current;
    const query=new URLSearchParams();
    if (roundId.current) query.set("round",roundId.current);
    if (referral.current) query.set("ref",referral.current);
    const next=await api<Model>("state"+(query.size?"?"+query.toString():""));
    if (seq!==sequence.current) return;
    setData(next);
    if (next.round) {
      epoch.current={seconds:next.round.serverTime,clock:Date.now(),closes:next.round.closes};
      setSeconds(Math.max(0,next.round.closes-next.round.serverTime));
    }
  },[]);
  useEffect(()=>{
    const saved=language(localStorage.getItem("ta_language")??"");
    if(saved) setLocale(saved);
    const query=new URLSearchParams(location.search);
    roundId.current=query.get("round")??"";
    referral.current=query.get("ref")??"";
    setReturnTo(location.pathname+location.search);
    if (query.has("club")) setTab("profile");
    setConfirm(query.get("confirm")??"");
    if (query.has("auth")) setMessage("error");
    load().catch(()=>setMessage("error")).finally(()=>setLoading(false));
    const poll=window.setInterval(()=>{void load().catch(()=>{});},12000);
    return ()=>clearInterval(poll);
  },[load]);
  useEffect(()=>{document.documentElement.lang=locale;},[locale]);
  useEffect(()=>{if(modal!=="entry"){setPhoto(null);setPhotoBusy(false);}},[modal]);
  useEffect(()=>{
    if(data.signedIn && !data.profile?.nickname && !confirm && !nicknamePrompted.current) {
      nicknamePrompted.current=true;
      setModal(current=>current??"nickname");
    }
  },[data.signedIn,data.profile?.nickname,confirm]);
  useEffect(()=>{
    if (!data.round || data.round.closed) return;
    const timer=window.setInterval(()=>{
      const start=epoch.current;
      const value=Math.max(0,start.closes-start.seconds-Math.floor((Date.now()-start.clock)/1000));
      setSeconds(value);
      if (value===0) {clearInterval(timer);void load().catch(()=>{});}
    },300);
    return ()=>clearInterval(timer);
  },[data.round,load]);

  function changeLocale(value:string) {
    const next=language(value);
    if(next){localStorage.setItem("ta_language",next);setLocale(next);}
  }
  async function run(work:()=>Promise<void>) {
    setBusy(true);setMessage(null);
    try {await work();}
    catch(error) {
      setMessage(errorLabel(error));
      if (error instanceof Error && error.message==="closed") await load().catch(()=>{});
    }
    finally{setBusy(false);}
  }
  function changeRound(id:string) {
    roundId.current=id;
    history.replaceState(null,"","/?round="+encodeURIComponent(id));
    setTab("feed");
  }
  function startTest() {
    if (!data.signedIn) {setModal("login");return;}
    void run(async()=>{
      const result=await api<{id:string}>("rounds","POST",{kind:"test"});
      changeRound(result.id);await load();
    });
  }
  function nickname(next:"entry"|null=null) {setAfterNickname(next);setModal("nickname");setMessage(null);}
  function enter(){
    setMessage(null);
    if (!data.signedIn) setModal("login");
    else if (!data.profile?.nickname) nickname("entry");
    else setModal("entry");
  }
  function vote(entry:Entry,negative=false) {
    if(!data.signedIn){setModal("login");return;}
    if(!data.round || data.round.closed || entry.mine) return;
    void run(async()=>{
      await api("rounds/"+data.round!.id+(negative?"/dislikes/":"/votes/")+entry.id,(negative?entry.disliked:entry.liked)?"DELETE":"PUT");
      await load();
    });
  }
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!data.round)return;
    if(!photo||photoBusy){setMessage("imageError");return;}
    const form=new FormData(event.currentTarget);
    form.set("photo",photo);
    void run(async()=>{
      await api("rounds/"+data.round!.id+"/entries","POST",form);await load();setModal(null);setMessage("published");
    });
  }
  function saveNickname(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value=new FormData(event.currentTarget).get("nickname");
    void run(async()=>{
      await api("profile/nickname","PUT",{nickname:value});await load();setModal(afterNickname);setAfterNickname(null);
      if (!afterNickname) setMessage("nicknameSaved");
    });
  }
  function share() {
    if(!data.round)return;
    const url=new URL("/?round="+encodeURIComponent(data.round.id),location.origin).href;
    if(navigator.share) void navigator.share({title:"TUNE ARENA",url}).catch(()=>{});
    else void navigator.clipboard.writeText(url).then(()=>setMessage("copied")).catch(()=>setMessage("error"));
  }
  function closeModal(){setModal(null);setMessage(null);setAfterNickname(null);}

  const round=data.round,closed=!!round?.closed,profile=data.profile;
  const sections:Section[]=["feed","top","profile"];
  const filtered=[...(data.entries??[])].filter(e=>(!onlyMine||e.mine)&&
    (!search.trim()||[e.name,e.description,e.nickname??""].join(" ").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())))
    .sort((a,b)=>sort==="popular"?b.likes-a.likes:b.created-a.created);
  const samples=Object.values(sampleGarage).filter(e=>!search.trim()||e.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  function navigate(next:Section) {setTab(next);setMessage(null);setSearch("");setOnlyMine(false);window.scrollTo({top:0,behavior:"instant"});}
  const action=()=>round?enter():startTest();
  const totalVotes=(data.entries??[]).reduce((n,e)=>n+e.likes,0);
  return <div className="shell social-shell">
    <header className="header social-header">
      <a href="/" className="brand"><span className="mark" aria-hidden="true">T</span><span>TUNE<span className="brand-accent">ARENA</span></span></a>
      <label className="social-search"><Search size={18}/><input type="search" aria-label={st.search} placeholder={st.search} value={search} onChange={e=>{setSearch(e.target.value);setTab("feed");}}/></label>
      <div className="header-actions"><select aria-label={t("language")} value={locale} onChange={e=>changeLocale(e.target.value)}>{languages.map(l=><option value={l} key={l}>{labels[l]}</option>)}</select>
        <a className="install-header-link" href="/install" aria-label={t("install")} title={t("install")}><Download size={19}/></a>
        <button className={"avatar header-user "+(profile?.frame??"plain")} onClick={()=>navigate("profile")} aria-label={t("profile")}>{profile?.nickname?.slice(0,1).toUpperCase()??<UserRound size={19}/>}</button></div>
    </header>
    <div className="social-layout">
    <aside className="social-rail"><div className="rail-inner">
      <p className="rail-label">{st.culture}</p>
      <nav aria-label="Tune Arena">{sections.map(n=>{const Icon=navIcons[n];return <button type="button" key={n} aria-current={tab===n?"page":undefined} onClick={()=>navigate(n)}><Icon size={22}/>{n==="feed"?st.feed:t(n)}{tab===n&&<span className="nav-dot"/>}</button>;})}
        <a href="/winners"><Trophy size={22}/>{t("winners")}</a>
        <a href="/install"><Download size={22}/>{t("install")}</a>
        <button type="button" onClick={()=>navigate("profile")}><Users size={22}/>{st.club}</button>
        {data.admin&&<a href="/admin"><ShieldCheck size={22}/>{t("admin")}</a>}
      </nav>
      <button className="primary rail-publish" disabled={busy||closed} onClick={action}><Plus size={20}/>{t("enter")}</button>
      <div className="rail-club"><Crown size={23}/><strong>TURBO CLUB</strong><p>{st.clubOffer}</p><button type="button" onClick={()=>navigate("profile")}>{st.clubOpen}<ArrowUpRight size={17}/></button></div>
      <button type="button" className="rail-account" onClick={()=>data.signedIn?navigate("profile"):setModal("login")}><span className={"avatar "+(profile?.frame??"plain")}>{profile?.nickname?.slice(0,1).toUpperCase()??"T"}</span><span><strong>{profile?.nickname?"@"+profile.nickname:t("login")}</strong><small>{profile?.premium?t("active"):st.pilot}</small></span></button>
    </div></aside>
    <main className="social-main">
      <div className="feed-heading"><div><p className="eyebrow">TUNE ARENA / COMMUNITY</p><h1>{tab==="feed"?st.feed:t(tab)}</h1></div><span className="pilot"><span/>{t("pilot")}</span></div>
      {tab==="feed"&&<>
      <section className="hero">
        <img className="hero-car" src="/garage/86.webp" alt="Toyota 86 Custom" fetchPriority="high"/>
        <div className="hero-copy"><p className="eyebrow">{t("garageTag")} <span> / </span> {t("kicker")}</p><h2>{t("line1")}<br/><em>{t("line2")}</em></h2><p>{t("intro")}</p>
          <div className="actions">{round ? !closed&&<button className="primary" onClick={enter}>+ {t("enter")}</button> : <button className="primary" disabled={busy} onClick={startTest}>{t("oneMinute")}</button>}
            <button className="outline" onClick={()=>setModal("rules")}>{t("rules")}</button></div>
        </div>
        <div className="hero-index" aria-hidden="true">TA<span> / </span>86</div>
      </section>
      </>}
      {tab==="feed"&&<div className="strip">
        <section className="timing"><span className="mini">{round?.title||t(round?.kind==="weekly"?"weekly":"test")}</span>
          <strong>{round ? closed?t("finished"):fmt(seconds) : "01:00"}</strong><small>{round ? closed?"":t("time") : t("challenge")}</small>
        </section>
        <section className="prize"><span className="mini">{t(round?.prize?"ownerPrize":"prize")}</span>
          <strong>{round?.prize||<>100 <b>USDT</b></>}</strong>{!round?.prize&&<small>{t("usdt")}</small>}</section>
      </div>}
      {round?.notice&&<p className="notice announcement"><span className="eyebrow">{t("roundNotice")}</span>{round.notice}</p>}
      {confirm && <aside className="notice"><button className="primary" disabled={busy} onClick={()=>void run(async()=>{await api("auth/email/verify","POST",{proof:confirm});location.replace("/");})}>{t("confirm")}</button></aside>}
      {message && !modal && <p className="notice" role="status">{t(message)}{message==="error" && <button className="outline" onClick={()=>void run(load)}>{t("again")}</button>}</p>}
      {tab==="feed"&&<>
        <section className="social-composer"><span className={"avatar "+(profile?.frame??"plain")}>{profile?.nickname?.slice(0,1).toUpperCase()??"T"}</span>
          <button type="button" className="composer-prompt" onClick={action} disabled={closed}>{st.composer}</button><button className="composer-photo" type="button" disabled={closed||busy} onClick={action} aria-label={st.addPhoto}><Camera size={22}/></button>
        </section>
        <nav className="feed-filters" aria-label={st.feed}><button type="button" aria-pressed={!onlyMine} onClick={()=>setOnlyMine(false)}>{st.all}</button><button type="button" aria-pressed={onlyMine} onClick={()=>setOnlyMine(true)}>{st.mine}</button>
          <select aria-label={st.sort} value={sort} onChange={e=>setSort(e.target.value)}><option value="new">{st.new}</option><option value="popular">{st.popular}</option></select></nav>
        {search&&<p className="search-summary">“{search}”<button aria-label={t("close")} onClick={()=>setSearch("")}><X size={16}/></button></p>}
      </>}
      {loading && <p className="notice">{t("load")}</p>}
      {!loading && tab==="feed" && !round && <section className="works">
        <div className="section-title"><h2>{st.explore}</h2><span className="state">{t("sampleOnly")}</span></div>
        {(onlyMine||samples.length===0)&&<div className="feed-empty"><Search size={25}/><p>{st.noMatches}</p><button className="outline" onClick={()=>{setSearch("");setOnlyMine(false);}}>{st.reset}</button></div>}
        <div className="grid gallery">{(!onlyMine?samples:[]).map(e=><article key={e.image} className="card social-post">
          <div className="post-header"><span className="post-photo-avatar"><img src={e.image} alt=""/></span><div><strong>{e.title}</strong><small>TUNE ARENA · {t("sampleOnly")}</small></div><span className="post-category">SHOWCASE</span></div>
          <div className="card-image"><img src={e.image} alt={e.title} loading="lazy"/></div>
          <div className="card-body"><p>{t("sampleText")}</p><a className="photo-credit" href={e.source} target="_blank" rel="noreferrer">{e.author} · {e.license}</a>
          <button type="button" className="sample-try" onClick={startTest}><Flag size={17}/>{t("oneMinute")}<ArrowUpRight size={17}/></button></div>
        </article>)}</div>
      </section>}
      {round && tab==="feed" && <section className="works">
        <div className="section-title"><h2>{t("feed")}</h2><span className={"state "+(closed?"":"live")}>{t(closed?"finished":"open")}</span></div>
        {closed && <div className="winner" role="status">{data.winner?<><span>{t(round.announced?"publishedWinner":"winner")}</span><strong>{data.winner.name}</strong>
          <small>{data.winner.nickname?"@"+data.winner.nickname+" · ":""}{data.winner.likes} · {t("votes")}</small></>:<strong>{t("none")}</strong>}
          <a className="winner-link" href="/winners">{t("winners")}</a></div>}
        {filtered.length===0&&<div className="feed-empty"><Search size={25}/><p>{search||onlyMine?st.noMatches:t("nothing")}</p>{(search||onlyMine)&&<button className="outline" onClick={()=>{setSearch("");setOnlyMine(false);}}>{st.reset}</button>}</div>}
        <div className="grid">{filtered.map((e,i)=><article key={e.id} className="card social-post">
          <div className="post-header"><span className={"avatar "+e.frame}>{(e.nickname||e.name).slice(0,1).toUpperCase()}</span><div><strong>{e.nickname?"@"+e.nickname:e.name}{e.gift>0&&<Crown size={13}/>}</strong><small>{e.sample?t("sampleOnly"):new Intl.DateTimeFormat(locale,{day:"numeric",month:"short"}).format(new Date(e.created*1000))} · {round.title||t(round.kind==="weekly"?"weekly":"test")}</small></div><span className="post-category">{e.mine?t("mine"):"BUILD"}</span></div>
          <div className="card-image"><img src={e.image} alt={e.name} loading={i===0?"eager":"lazy"}/><span>{e.mine?t("mine"):e.sample?t("sampleOnly"):String(i+1).padStart(2,"0")}</span></div>
          <div className="card-body"><h3>{e.name}</h3>
          <p>{e.sample?t("sampleText"):e.description}</p>
          {e.credit&&<a className="photo-credit" href={e.credit.source} target="_blank" rel="noreferrer">{e.credit.author} · {e.credit.license}</a>}
          <div className="card-actions">
            <button className="like" type="button" aria-label={t("vote")} aria-pressed={e.liked} disabled={busy||closed||e.mine} onClick={()=>vote(e)}><Heart size={21} fill={e.liked?"currentColor":"none"}/> <strong>{e.likes}</strong> <small>{t(e.liked?"voted":"vote")}</small></button>
            <button className="dislike" type="button" aria-label={t("dislikeAction")} aria-pressed={e.disliked} disabled={busy||closed||e.mine} onClick={()=>vote(e,true)}><ThumbsDown size={20} fill={e.disliked?"currentColor":"none"}/><strong>{e.dislikes}</strong></button>
            <button className="post-share" type="button" onClick={share} aria-label={t("share")}><Send size={20}/></button>
          </div></div>
        </article>)}</div>
      </section>}
      {tab==="top" && <section className="panel">
        <h2>{t("top")}</h2><p>{round?t(closed?(data.winner?"winner":"none"):"pending"):t("nothing")}{closed&&data.winner?" · "+data.winner.name:""}</p>
        <ol className="rank">{data.entries?.map(e=><li key={e.id}><strong>{e.name}</strong><span>{e.likes} · {t("votes")}</span></li>)}</ol>
      </section>}
      {tab==="profile" && <section className="panel premium">
        <div className="premium-title"><span className={"avatar "+(profile?.premium?profile.frame:"plain")}>{profile?.nickname?.slice(0,1).toUpperCase()??"T"}</span><div><p className="eyebrow">TURBO CLUB</p><h2>{profile?.nickname?"@"+profile.nickname:t("premium")}</h2></div></div>
        <p>{t("premiumText")}</p><small>{t("cosmetic")}</small>
        <div className="actions">{profile?.premium ? <><span className="state">{t("active")}</span>{profile.gift?<span>✦ {t("flame")}</span>:<button className="primary" disabled={busy} onClick={()=>void run(async()=>{await api("gift","POST");await load();})}>{t("claim")}</button>}</> :
          !profile?.trialUsed&&<button className="primary" disabled={busy} onClick={()=>data.signedIn?void run(async()=>{await api("premium","POST");await load();}):setModal("login")}>{t("trialPremium")}</button>}</div>
        <ClubPanel club={data.club} locale={locale} premiumUntil={profile?.premiumUntil} onLogin={()=>setModal("login")}/>
        <h3 className="subheading">{t("frames")}</h3>
        {!profile?.premium&&<p>{t("framesLock")}</p>}
        <div className="frame-grid">{frames.map(frame=>{
          const equipped=profile?.premium&&profile.frame===frame,locked=!profile?.premium||(frame==="flame"&&!profile.gift);
          return <button className="frame-card" type="button" disabled={locked||busy} aria-pressed={!!equipped} key={frame}
            onClick={()=>void run(async()=>{await api("profile/frame","PUT",{frame});await load();})}>
            <span className={"avatar "+frame}>{profile?.nickname?.slice(0,1).toUpperCase()??"T"}</span>
            <strong>{frameTitles[frame]}</strong>{equipped&&<small>{t("equipped")}</small>}
            {frame==="flame"&&!profile?.gift&&<small>{t("giftLock")}</small>}
          </button>;
        })}</div>
        <div className="actions">{data.signedIn&&<button className="outline" onClick={()=>nickname()}>{t("nickname")}</button>}
          <button className="outline" onClick={()=>setModal("login")}>{t("login")} · Telegram / Email</button></div>
      </section>}
      {tab==="feed"&&<section className="parts" aria-label={t("components")}>
        <div className="section-title"><div><p className="eyebrow">GARAGE / PARTS</p><h2>{t("components")}</h2></div></div>
        <div className="parts-grid">{workshop.map(p=><article key={p.image} className="part"><img src={p.image} alt={p.title} loading="lazy"/>
          <div><h3>{p.title}</h3><a className="photo-credit" href={p.source} target="_blank" rel="noreferrer">{p.author} · {p.license}</a></div></article>)}</div>
      </section>}
      <footer className="footer">
        <div className="actions">{round&&<button className="outline" onClick={share}>{t("share")}</button>}
          {!loading&&data.signedIn&&<button className="outline" disabled={busy} onClick={startTest}>{t("trial")}</button>}</div>
        <details className="credits"><summary>{t("photoCredits")}</summary><ul>{photoCredits.map(p=><li key={p.image}>
          <a href={p.source} target="_blank" rel="noreferrer">{p.title} · {p.author}</a> · {p.terms?<a href={p.terms} target="_blank" rel="noreferrer">{p.license}</a>:p.license} · {t("photoAdapted")}
        </li>)}</ul></details><p>{t("ownerCredit")}</p>
      </footer>
    </main>
    <aside className="social-side"><div className="side-inner">
      <section className="side-card side-contest"><div className="side-card-title"><span className="side-icon"><Flag size={19}/></span><h2>{st.spotlight}</h2></div>
        <img src="/garage/r34.webp" alt="Nissan Skyline GT-R R34"/>
        <h3>{round?.title||t(round?.kind==="weekly"?"weekly":"test")}</h3><p>{round?closed?t("finished"):t("open"):t("challenge")}</p>
        <div className="side-timer"><Timer size={18}/><strong>{round?closed?t("finished"):fmt(seconds):"00:00:01:00"}</strong></div>
        {round&&<dl className="side-stats"><div><dt>{t("feed")}</dt><dd>{data.entries?.length??0}</dd></div><div><dt>{t("votes")}</dt><dd>{totalVotes}</dd></div></dl>}
        <button type="button" className="primary" onClick={action} disabled={busy||closed}><Plus size={17}/>{round?t("enter"):t("oneMinute")}</button>
      </section>
      <section className="side-card side-premium"><Crown size={25}/><p className="eyebrow">TURBO CLUB</p><h2>{st.clubText}</h2><p>{st.clubOffer}</p>
        {data.club&&<><progress value={data.club.progress} max={3} aria-label={st.club}/><small>{data.club.progress} / 3</small></>}
        <button type="button" onClick={()=>navigate("profile")}>{st.clubOpen}<ArrowUpRight size={17}/></button>
      </section>
      <section className="side-card side-how"><h2>{st.how}</h2><ol><li><span>01</span>{st.step1}</li><li><span>02</span>{st.step2}</li><li><span>03</span>{st.step3}</li></ol><button className="text-button" onClick={()=>setModal("rules")}>{t("rules")}<ChevronRight size={16}/></button></section>
      <p className="side-credit">{t("ownerCredit")}</p>
    </div></aside>
    </div>
    <nav className="mobile-nav" aria-label="Tune Arena mobile">{sections.slice(0,2).map(n=>{const Icon=navIcons[n];return <button key={n} aria-current={tab===n?"page":undefined} onClick={()=>navigate(n)}><Icon size={22}/><span>{n==="feed"?t("feed"):t(n)}</span></button>;})}
      <button className="mobile-create" onClick={action} disabled={busy||closed} aria-label={t("enter")}><Plus size={26}/></button><a href="/winners"><Trophy size={22}/><span>{t("winners")}</span></a><button aria-current={tab==="profile"?"page":undefined} onClick={()=>navigate("profile")}><UserRound size={22}/><span>{t("profile")}</span></button></nav>
    {!modal&&data.club&&<ClubReward club={data.club} locale={locale} busy={busy} onDismiss={()=>void run(async()=>{
      await api("referrals/ack","POST",{rewardBatches:data.club!.earnedMonths,welcome:data.club!.welcomePending});await load();
    })}/>}
    {modal && <div className="overlay" onClick={event=>{if(event.target===event.currentTarget)closeModal();}}>
      <section className="dialog" role="dialog" aria-modal="true" aria-label={t(modal==="entry"?"upload":modal)} onKeyDown={e=>{if(e.key==="Escape")closeModal();}}>
        <button className="dismiss" autoFocus onClick={closeModal} aria-label={t("close")}>×</button>
        {modal==="rules" && <><h2>{t("rules")}</h2><p>{t("help")}</p><p>{t("reactionRule")}</p><p>{t("fair")}</p><p>{t("cosmetic")}</p></>}
        {modal==="nickname"&&<><h2>{t("nickname")}</h2><p>{t("nicknameHint")}</p><form onSubmit={saveNickname}>
          <label>{t("nickname")}<input name="nickname" autoComplete="nickname" defaultValue={profile?.nickname??""} minLength={3} maxLength={24} required/></label>
          <button className="primary" disabled={busy}>{t("save")}</button></form></>}
        {modal==="entry" && <><h2>{t("upload")}</h2><form onSubmit={submit}>
          <label>{t("name")}<input name="name" required maxLength={55}/></label>
          <label>{t("desc")}<textarea name="description" required maxLength={160} rows={3}/></label>
          <div className="photo-field-label">{t("photo")}</div><PhotoPicker locale={locale} onChange={setPhoto} onError={()=>setMessage("imageError")} onBusy={setPhotoBusy}/>
          <label className="check"><input name="rights" type="checkbox" value="yes" required/>{t("rights")}</label>
          <button className="primary" disabled={busy||photoBusy||!photo}>{t("publish")}</button>
        </form></>}
        {modal==="login" && <><h2>{t("login")}</h2><p>{t("loginText")}</p>
          {data.providers.local&&!data.signedIn&&<button className="primary" disabled={busy} onClick={()=>void run(async()=>{await api("auth/dev","POST");await load();setModal(null);})}>DEMO · Local driver / Локальный участник</button>}
          {data.signedIn&&!data.providers.chatgpt&&<button className="outline" onClick={()=>void run(async()=>{await api("auth/logout","POST");location.replace("/");})}>Sign out / Выйти</button>}
          {!data.signedIn && data.providers.chatgpt && <a className="primary" href={"/signin-with-chatgpt?return_to="+encodeURIComponent(returnTo)} target="_top">{t("access")}</a>}
          <button className="outline telegram" onClick={()=>data.providers.telegram?location.assign("/api/auth/telegram"):setMessage("unconfigured")}>Telegram</button>
          <form onSubmit={event=>{event.preventDefault();const email=new FormData(event.currentTarget).get("email");void run(async()=>{await api("auth/email","POST",{email});setMessage("sent");});}}>
            <label>{t("email")}<input name="email" type="email" required autoComplete="email"/></label><button className="outline" disabled={busy}>{t("send")}</button>
          </form></>}
        {message&&<p className="notice" role="status">{t(message)}</p>}
      </section>
    </div>}
  </div>;
}
