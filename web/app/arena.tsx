"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { languages, language, type Locale } from "@/lib/locale";
import { translate, type Text } from "@/lib/strings";
import { api, errorLabel } from "@/lib/client";
import { frames, frameTitles } from "@/lib/garage";
import ClubPanel, { ClubReward } from "./club-panel";
import type { Club } from "@/lib/referrals";
import { socialText } from "@/lib/social-strings";
import { accessText } from "@/lib/access-strings";
import TourList from "./tour-list";
import RaceTrackIcon from "@/components/race-track-icon";
import TurboIcon from "@/components/turbo-icon";
import { Home, Trophy, UserRound, Users, Search, Plus, Heart, Send, ArrowUpRight, Timer, ShieldCheck, Camera, Crown, LockKeyhole, Check, X, SquarePlus } from "lucide-react";

type Credit={author:string;source:string;license:string;terms?:string};
type Entry={avatar?:string|null;id:string;name:string;description:string;image:string;likes:number;liked:boolean;mine:boolean;sample:boolean;frame:string;gift:number;nickname:string|null;created:number;premium:boolean;motors:number;score:number;entryOrder:number;credit?:Credit};
type Profile={avatar?:string|null;championTitles?:number;nickname:string|null;premium:boolean;premiumUntil:number;trialUsed:boolean;frame:string;gift:boolean};
type Round={id:string;kind:string;opens?:number;submissionsClose:number;submissionsClosed:boolean;closes:number;serverTime:number;closed:boolean;title:string;notice:string;prize:string;announced:number};
type OwnEntry={id:string;name:string;description:string;withdrawn:number;image?:string;likes?:number;score?:number;rank?:number|null;moderation_state?:string;moderation_reason?:string};
type PremiumProduct={id:string;name:string;kind:string;amount:number;currency:string;duration:number;stock:number};
type GarageTrophy={code:string;category:string;title:string;name:string;issued:number;revoked:number};
type Model={nextRound?:{id:string;title:string;opens:number;prize?:string}|null;myEntry?:OwnEntry|null;overallWinner?:Entry|null;motor?:{enabled:boolean;available:boolean;spentEntry:string|null};signedIn:boolean;admin?:boolean;role?:"owner"|"organizer"|"participant";providers:{telegram:boolean};round?:Round;
  winner?:{id:string;name:string;likes:number;nickname:string|null}|null;entries?:Entry[];profile?:Profile;club?:Club|null};
type Section="feed"|"top"|"profile";
type Modal="frames"|"premium"|"rules"|"withdraw"|"login"|"nickname"|"deleteAccount";
const labels={en:"English",pt:"Português",es:"Español",ru:"Русский",uk:"Українська",fr:"Français"};
const navIcons={feed:Home,top:RaceTrackIcon,profile:UserRound};
const empty:Model={signedIn:false,providers:{telegram:false}};
const fmt=(seconds:number)=>[Math.floor(seconds/86400),Math.floor(seconds/3600)%24,Math.floor(seconds/60)%60,seconds%60].map(x=>String(x).padStart(2,"0")).join(":");

export default function Arena({initialLanguage}:{initialLanguage:Locale}) {
  const [locale,setLocale]=useState(initialLanguage),[data,setData]=useState<Model>(empty);
  const [tab,setTab]=useState<Section>("feed"),[modal,setModal]=useState<Modal|null>(null);
  const [message,setMessage]=useState<Text|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [seconds,setSeconds]=useState(0),[confirm,setConfirm]=useState("");
  const [editing,setEditing]=useState<OwnEntry|null>(null);
  const accountRemoved=useRef(false);
  const [deletionConfirmed,setDeletionConfirmed]=useState(false);
  const roundId=useRef(""),nicknamePrompted=useRef(false);
  const referral=useRef("");
  const [returnTo,setReturnTo]=useState("/");
  const epoch=useRef({seconds:0,clock:0,closes:0});
  const sequence=useRef(0);
  const t=(key:Text)=>translate(locale,key);
  const st=socialText(locale);
  const [search,setSearch]=useState("");
  const [garage,setGarage]=useState<{products:PremiumProduct[];trophies:GarageTrophy[];ready:boolean;priceError:boolean;trophyError:boolean}>({products:[],trophies:[],ready:false,priceError:false,trophyError:false});
  const [garageRefresh,setGarageRefresh]=useState(0);
  const garageActive=tab==="profile"||modal==="frames"||modal==="premium";
  const modalOpen=!!modal;
  useEffect(()=>{
    if(!modalOpen)return;
    const trigger=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    return()=>{document.body.style.overflow=overflow;if(trigger?.isConnected)trigger.focus();};
  },[modalOpen]);
  useEffect(()=>{if(modal)document.querySelector<HTMLElement>(".dialog .dismiss")?.focus();},[modal]);
  useEffect(()=>{
    if(!garageActive)return;
    let alive=true;
    const catalog=api<{products:PremiumProduct[]}>("commerce/catalog");
    const trophies=data.signedIn?api<{trophies:GarageTrophy[]}>("trophies"):Promise.resolve({trophies:[]});
    void Promise.allSettled([catalog,trophies]).then(([prices,awards])=>{
      if(!alive)return;
      setGarage({products:prices.status==="fulfilled"?prices.value.products:[],trophies:awards.status==="fulfilled"?awards.value.trophies.filter(t=>!t.revoked):[],ready:true,priceError:prices.status==="rejected",trophyError:awards.status==="rejected"});
    });
    return()=>{alive=false;};
  },[garageActive,data.signedIn,garageRefresh]);

  const load=useCallback(async ()=>{
    if(accountRemoved.current)return;
    const seq=++sequence.current;
    const query=new URLSearchParams();
    if (roundId.current) query.set("round",roundId.current);
    if (referral.current) query.set("ref",referral.current);
    const next=await api<Model>("state"+(query.size?"?"+query.toString():""));
    if (seq!==sequence.current) return;
    setData(next);
    if(next.signedIn){try{localStorage.setItem("ta_known_account","1");}catch{/* Device memory is optional. */}}
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
    if (query.has("club")||query.has("garage")) setTab("profile");
    if(query.has("tour"))setTab("top");
    setConfirm(query.get("confirm")??"");
    if (query.has("auth")) setMessage("error");
    load().catch(()=>setMessage("error")).finally(()=>setLoading(false));
    const poll=window.setInterval(()=>{void load().catch(()=>{});},12000);
    return ()=>clearInterval(poll);
  },[load]);
  useEffect(()=>{document.documentElement.lang=locale;},[locale]);
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
      if (error instanceof Error && ["closed","submissions_closed","entry_replaced","not_found","premium_required"].includes(error.message)) await load().catch(()=>{});
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
  function nickname() {setModal("nickname");setMessage(null);}
  function vote(entry:Entry) {
    if(!data.signedIn){setModal("login");return;}
    if(!data.round || data.round.closed || entry.mine) return;
    void run(async()=>{
      await api("rounds/"+data.round!.id+"/votes/"+entry.id,entry.liked?"DELETE":"PUT");
      await load();
    });
  }
  function motor(entry:Entry) {
    if(!data.signedIn){setModal("login");return;}
    if(!data.profile?.premium){setModal("premium");return;}
    if(!data.round||closed||entry.mine||!data.motor?.available)return;
    void run(async()=>{await api("rounds/"+data.round!.id+"/motors/"+entry.id,"PUT");await load();});
  }
  function withdraw(){
    if(!round||!editing)return;
    void run(async()=>{await api('rounds/'+round.id+'/entries/'+editing.id,'DELETE');await load();setModal(null);setMessage('buildWithdrawn');});
  }
  function saveNickname(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value=new FormData(event.currentTarget).get("nickname");
    void run(async()=>{
      await api("profile/nickname","PUT",{nickname:value});await load();setModal(null);setMessage("nicknameSaved");
    });
  }
  function share() {
    if(!data.round)return;
    const url=new URL("/?round="+encodeURIComponent(data.round.id),location.origin).href;
    if(navigator.share) void navigator.share({title:"TUNE ARENA",url}).catch(()=>{});
    else void navigator.clipboard.writeText(url).then(()=>setMessage("copied")).catch(()=>setMessage("error"));
  }
  function deleteOwnAccount(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!deletionConfirmed||!data.signedIn||busy)return;
    void run(async()=>{
      const result=await api<{ok:boolean}>("account","DELETE",{confirmation:"DELETE"});
      if(result.ok!==true)throw new Error("server_error");
      accountRemoved.current=true;sequence.current++;setData(empty);setModal(null);
      try{localStorage.removeItem("ta_known_account");}catch{}
      location.replace("/?deleted=1");
    });
  }
  function closeModal(){if(modal==="deleteAccount"&&busy)return;setModal(modal==="premium"?"frames":null);setMessage(null);}

  const round=data.round,closed=!!round?.closed,profile=data.profile;
  const submissionsClosed=closed||!!round&&(round.submissionsClosed||round.closes-seconds>=round.submissionsClose);
  const entryDate=(epoch:number)=>new Intl.DateTimeFormat(locale,{timeZone:'Europe/Lisbon',dateStyle:'medium',timeStyle:'short'}).format(epoch*1000);
  const sections:Section[]=["feed","top","profile"];
  const participantEntries=(data.entries??[]).filter(e=>!e.sample);
  const filtered=[...participantEntries].filter(e=>
    (!search.trim()||[e.name,e.description,e.nickname??""].join(" ").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())))
    .sort((a,b)=>b.created-a.created);
  function navigate(next:Section) {setTab(next);setMessage(null);setSearch("");window.scrollTo({top:0,behavior:"instant"});}
  const entryUploadHref="/upload/entry"+(round?"?round="+encodeURIComponent(round.id):"");
  const roundTitle=round?.kind==="test"?(round.title||t("test")):round?.title&&round.title!=="Недельный раунд"?round.title:t("nightNeon");
  const myCar=data.myEntry&&!data.myEntry.withdrawn?data.myEntry:null;
  const ownVisible=myCar?participantEntries.find(e=>e.id===myCar.id):undefined;
  const myCarImage=myCar?.image??ownVisible?.image;
  const fallbackRank=myCar?[...participantEntries].sort((a,b)=>b.score-a.score||a.created-b.created||a.entryOrder-b.entryOrder).findIndex(e=>e.id===myCar.id):-1;
  const myCarRank=myCar?.rank??(fallbackRank<0?null:fallbackRank+1);
  const premiumOffer=garage.products.find(p=>p.kind==="premium"&&p.stock!==0&&p.amount>0);
  const premiumHref="/shop?premium=1"+(premiumOffer?"&product="+encodeURIComponent(premiumOffer.id):"");
  function premiumCard(){
    return <section className="panel garage-premium-card" data-garage-section="premium">
      <div className="garage-premium-main"><div><h2><Crown size={18}/>Premium</h2><p className="garage-premium-price">{!garage.ready?t("garageLoading"):premiumOffer?new Intl.NumberFormat(locale,{style:"currency",currency:premiumOffer.currency}).format(premiumOffer.amount/100):t(garage.priceError?"garagePriceError":"garagePricePending")}{premiumOffer&&premiumOffer.duration>0&&<small> / {new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(premiumOffer.duration/86400)} {t("garageDays")}</small>}</p>
        {!!profile?.premiumUntil&&<p className="garage-premium-expiry">{t(profile.premium?"garageUntil":"garageExpired")} <time dateTime={new Date(profile.premiumUntil*1000).toISOString()}>{new Intl.DateTimeFormat(locale,{day:"numeric",month:"long",timeZone:"Europe/Lisbon"}).format(profile.premiumUntil*1000)}</time></p>}</div>
        <a className="primary" href={premiumHref}>{t(profile?.premiumUntil?"garageRenew":"garageBuy")}</a></div>
      {garage.priceError&&<button className="text-button" type="button" onClick={()=>setGarageRefresh(n=>n+1)}>{t("refresh")}</button>}
    </section>;
  }
  function chooseFrame(frame:typeof frames[number]){
    if(frame!=="plain"&&!profile?.premium){setModal("premium");setMessage(null);return;}
    if(!data.signedIn)return;
    void run(async()=>{
      if(frame==="flame"&&!profile?.gift)await api("gift","POST");
      await api("profile/frame","PUT",{frame});await load();
    });
  }
  return <div className="shell social-shell">
    <header className="header social-header">
      <a href="/" className="brand"><span className="mark" aria-hidden="true">T</span><span>TUNE<span className="brand-accent">ARENA</span></span></a>
      <label className="social-search"><Search size={18}/><input type="search" aria-label={st.search} placeholder={st.search} value={search} onChange={e=>{setSearch(e.target.value);setTab("feed");}}/></label>
      <div className="header-actions"><a className="menu-home" href="/">Главное меню</a><select aria-label={t("language")} value={locale} onChange={e=>changeLocale(e.target.value)}>{languages.map(l=><option value={l} key={l}>{labels[l]}</option>)}</select>
        <a className="install-header-link" href="/install" aria-label={t("install")} title={t("install")}><SquarePlus size={19}/></a>
        <button className={"avatar header-user "+(profile?.frame??"plain")} onClick={()=>{navigate("profile");setModal("frames");}} aria-label={t("garageAppearance")}>{profile?.avatar?<img src={profile.avatar} alt=""/>:profile?.nickname?.slice(0,1).toUpperCase()??<UserRound size={19}/>}</button></div>
    </header>
    <div className="social-layout">
    <aside className="social-rail"><div className="rail-inner">
      <p className="rail-label">{st.culture}</p>
      <nav aria-label="Tune Arena"><a href="/">← Главное меню</a>{sections.map(n=>{const Icon=navIcons[n];return <button type="button" key={n} aria-current={tab===n?"page":undefined} onClick={()=>navigate(n)}><Icon size={22}/>{n==="feed"?st.feed:t(n)}{tab===n&&<span className="nav-dot"/>}</button>;})}
        <a href="/trophies">Мои трофеи</a><a href="/winners"><Trophy size={22}/>{t("winners")}</a>
        <a href="/install"><SquarePlus size={22}/>{t("install")}</a>
        <button type="button" onClick={()=>navigate("profile")}><Users size={22}/>{st.club}</button>
        {data.role==="owner"&&<a href="/business">Коммерческий кабинет</a>}
        {data.admin&&<a href="/admin"><ShieldCheck size={22}/>{data.role==="organizer"?accessText(locale,"assigned"):t("admin")}</a>}
      </nav>
      <a className="primary rail-publish" href={entryUploadHref} target="_top"><Plus size={20}/>{t("enter")}</a>
      <button type="button" className="rail-account" onClick={()=>data.signedIn?navigate("profile"):setModal("login")}><span className={"avatar "+(profile?.frame??"plain")}>{profile?.avatar?<img src={profile.avatar} alt=""/>:profile?.nickname?.slice(0,1).toUpperCase()??"T"}</span><span><strong>{profile?.nickname?"@"+profile.nickname:t("login")}</strong><small>{profile?.premium?t("active"):st.pilot}</small></span></button>
    </div></aside>
    <main className={"social-main"+(tab==="feed"?" participant-feed-main":"")}>
      {tab==="feed"?<h1 className="sr-only">{st.feed}</h1>:<div className="feed-heading"><div><p className="eyebrow">TUNE ARENA / COMMUNITY</p><h1>{t(tab)}</h1></div><span className="pilot"><span/>{t("pilot")}</span></div>}
      {tab==="top"&&<section className="tour-banner" aria-label={t("roundBanner")}>
        <div className="tour-banner-heading"><span className="eyebrow">{t("top")}</span><button type="button" className="tour-rules" onClick={()=>setModal("rules")}>{t("rules")}</button></div>
        <h2>{round?roundTitle:t("nothing")}</h2>
        <p className="tour-status">{round?t(closed?"tourEnded":round.opens&&round.opens>round.serverTime?"tourScheduled":"tourCurrent"):t("nothing")}</p>
        {round&&<p>{t("tourStarts")}: {entryDate(round.opens??round.serverTime)} · {t("tourEnds")}: {entryDate(round.closes)}</p>}
        <div className="tour-banner-meta"><span className="tour-prize"><Trophy size={17}/>{round?.prize||t("winnerPrizePending")}</span><span className="tour-countdown"><Timer size={17}/><strong>{round?(closed?t("finished"):fmt(seconds)):"—"}</strong></span></div>
        {round&&<button type="button" className="outline tour-share" onClick={share}><Send size={17}/>{t("tourShare")}</button>}
      </section>}
      {tab==="top"&&<><section className="panel next-tour" aria-label={t("tourNext")}><span className="eyebrow">{t("tourNext")}</span>{data.nextRound?<><h2>{data.nextRound.title||t("nightNeon")}</h2><p>{t("tourStarts")}: <time dateTime={new Date(data.nextRound.opens*1000).toISOString()}>{entryDate(data.nextRound.opens)}</time> · {t("winnerPrize")}: <strong>{data.nextRound.prize||t("winnerPrizePending")}</strong></p></>:<p>{loading?t("load"):t("tourUnscheduled")}</p>}</section><TourList locale={locale}/></>}
      {loading && tab==="feed" && <p className="notice" role="status">{t("load")}</p>}
      {!loading && tab==="feed" && <section className="works participant-feed" aria-label={st.feed}>
        {filtered.length===0&&<div className="feed-empty"><p>{search?st.noMatches:t("noParticipantPhotos")}</p>{search&&<button className="outline" onClick={()=>setSearch("")}>{st.reset}</button>}</div>}
        <div className="grid">{filtered.map((e,i)=><article key={e.id} className={"card social-post "+(e.premium?"premium-post frame-"+e.frame:"")}>
          <div className="card-image"><img src={e.image} alt={e.name} loading={i===0?"eager":"lazy"} fetchPriority={i===0?"high":"auto"}/><span>{e.mine?t("mine"):String(i+1).padStart(2,"0")}</span></div>
          <div className="post-header"><span className={"avatar "+e.frame}>{e.avatar?<img src={e.avatar} alt=""/>:(e.nickname||e.name).slice(0,1).toUpperCase()}</span><div><strong className={e.premium?"premium-name":""}>{e.nickname?"@"+e.nickname:e.name}{!!e.premium&&<Crown size={13} aria-label={t("chargedGarage")}/>}</strong><small>{new Intl.DateTimeFormat(locale,{day:"numeric",month:"short"}).format(new Date(e.created*1000))} · {roundTitle}</small></div><span className="post-category">{e.mine?t("mine"):"BUILD"}</span></div>
          <div className="card-body"><h3>{e.name}</h3>
          <p>{e.description}</p>
          {e.credit&&<a className="photo-credit" href={e.credit.source} target="_blank" rel="noreferrer">{e.credit.author} · {e.credit.license}</a>}
          <div className="card-actions">
            <button className="like" type="button" aria-label={t("vote")} aria-pressed={e.liked} disabled={busy||closed||e.mine} onClick={()=>vote(e)}><Heart size={21} fill={e.liked?"currentColor":"none"}/> <strong>{e.likes}</strong> <small>{t(e.liked?"voted":"vote")}</small></button>
            {data.motor?.enabled&&<button className="motor-button" type="button" aria-label={t("motor")+" +5"} aria-pressed={data.motor.spentEntry===e.id}
              disabled={busy||closed||e.mine||!!data.motor.spentEntry} onClick={()=>motor(e)} title={t(data.motor.spentEntry?"motorSpent":"motorRule")}><TurboIcon size={21}/><strong>+5</strong><small>{t("motor")}</small></button>}
            <button className="post-share" type="button" onClick={share} aria-label={t("share")}><Send size={20}/></button>
          </div><small className="score-line">♥ {e.likes} · {t("motor")} {e.motors} × 5 · {t("overall")}: {e.score}</small></div>
        </article>)}</div>
      </section>}
      {message && !modal && <p className="notice" role="status">{t(message)}{message==="error" && <button className="outline" onClick={()=>void run(load)}>{t("again")}</button>}</p>}
      {tab==="profile"&&<div className="garage-stack">
        <section className="panel garage-profile" data-garage-section="profile">
          <div className="garage-avatar-wrap"><button className={"avatar garage-avatar "+(profile?.premium?profile.frame:"plain")} type="button" onClick={()=>setModal("frames")} aria-label={t("garageAppearance")}>{profile?.avatar?<img src={profile.avatar} alt=""/>:profile?.nickname?.slice(0,1).toUpperCase()??<UserRound size={28}/>}</button><a className="garage-avatar-upload" href="/upload/avatar" target="_top" aria-label={t("avatarUpload")}><Camera size={16}/></a></div>
          <div className="garage-identity"><button className={"garage-nickname "+(profile?.premium?"premium-name":"")} type="button" onClick={()=>data.signedIn?nickname():setModal("login")} aria-label={t("nickname")}>{profile?.nickname?"@"+profile.nickname:t("login")}</button>{profile?.premium&&<span className="garage-premium-badge"><Crown size={13}/>Premium</span>}</div>
        </section>
        <section className={"panel garage-car "+(myCar&&profile?.premium?"premium-post frame-"+profile.frame:"")} data-garage-section="car">
          <h2>{t("garageMyCar")}</h2>
          {myCar?<>
            {myCarImage&&<img className="garage-car-photo" src={myCarImage} alt={myCar.name}/>}
            <h3>{myCar.name}</h3><p className="garage-car-description">{myCar.description}</p>
            <dl className="garage-car-stats"><div><dt>{t("votes")}</dt><dd><Heart size={16}/>{myCar.likes??ownVisible?.likes??0}</dd></div><div><dt>{t("garageRank")}</dt><dd>{myCarRank?"#"+myCarRank:t("garageUnranked")}</dd></div></dl>
            {myCar.moderation_state==='pending'&&<p className="garage-muted">{t("garagePending")}</p>}
            {myCar.moderation_state==='rejected'&&<p className="garage-muted">{t("garageRejected")}{myCar.moderation_reason?": "+myCar.moderation_reason:""}</p>}
            {profile?.premium&&<div className="actions"><a className="outline" href={entryUploadHref} target="_top">{t("garageReplace")}</a><button className="outline danger-button" disabled={busy||submissionsClosed||myCar.moderation_state==='pending'||myCar.moderation_state==='rejected'} onClick={()=>{setEditing(myCar);setModal('withdraw');}}>{t("garageDelete")}</button></div>}
            {submissionsClosed&&<p className="garage-muted">{t("submissionsClosed")}</p>}
          </>:<><p className="garage-muted">{t("garageNoCar")}</p><a className="primary" href={entryUploadHref} target="_top"><Plus size={18}/>{t("garageUploadCar")}</a>{submissionsClosed&&<p className="garage-muted">{t("submissionsClosed")}</p>}</>}
        </section>
        {premiumCard()}
        <ClubPanel club={data.club} locale={locale} onLogin={()=>setModal("login")}/>
        {(garage.trophies.length>0||garage.trophyError)&&<section className="panel garage-trophies" data-garage-section="trophies"><div className="garage-section-heading"><h2>{t("garageTrophies")}</h2><a href="/trophies">{t("garageAllTrophies")} <ArrowUpRight size={15}/></a></div>
          {garage.trophyError?<p className="garage-muted">{t("garageTrophyError")}</p>:<ul>{garage.trophies.slice(0,3).map(award=><li key={award.code}><Trophy size={22}/><div><strong>{t(award.category==='overall'?"roundChampion":"popularChoice")}</strong><p>{award.title} · {award.name}</p><small>{new Intl.DateTimeFormat(locale,{day:"numeric",month:"short",year:"numeric",timeZone:"Europe/Lisbon"}).format(award.issued*1000)}</small></div><a className="outline" href={"/trophies/"+encodeURIComponent(award.code)} aria-label={award.title+" · "+t("garageAllTrophies")}><ArrowUpRight size={17}/></a></li>)}</ul>}
        </section>}
        {data.signedIn&&<section className="panel garage-account-actions" data-garage-section="account"><button className="outline danger-button account-delete-button" type="button" disabled={busy} onClick={()=>{setDeletionConfirmed(false);setMessage(null);setModal("deleteAccount");}}>{t("deleteAccount")}</button></section>}
      </div>}

      {tab!=="feed"&&<footer className="footer">
        <p>{t("ownerCredit")}</p>
      </footer>}
    </main>
    </div>
    <nav className="mobile-nav" aria-label="Tune Arena mobile">{sections.slice(0,2).map(n=>{const Icon=navIcons[n];return <button key={n} aria-current={tab===n?"page":undefined} onClick={()=>navigate(n)}><Icon size={22}/><span>{n==="feed"?t("feed"):t(n)}</span></button>;})}
      <a className="mobile-create" href={entryUploadHref} target="_top" aria-label={t("enter")}><Plus size={26}/></a><a href="/winners"><Trophy size={22}/><span>{t("winners")}</span></a><button aria-current={tab==="profile"?"page":undefined} onClick={()=>navigate("profile")}><UserRound size={22}/><span>{t("profile")}</span></button></nav>
    {tab==="profile"&&!modal&&data.club&&<ClubReward club={data.club} locale={locale} busy={busy} onDismiss={()=>void run(async()=>{
      await api("referrals/ack","POST",{rewardBatches:data.club!.earnedMonths,welcome:data.club!.welcomePending});await load();
    })}/>}
    {modal && <div className={"overlay"+(modal==="frames"?" sheet-overlay":"")} onClick={event=>{if(event.target===event.currentTarget)closeModal();}}>
      <section className={"dialog"+(modal==="frames"?" avatar-sheet":"")} role="dialog" aria-modal="true" aria-label={t(modal==="frames"?"garageAppearance":modal==="premium"?"premium":modal==="withdraw"?"withdrawBuild":modal)} onKeyDown={e=>{if(e.key==="Escape")closeModal();if(e.key==="Tab"){const controls=[...e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled])')];const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first&&last){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last&&first){e.preventDefault();first.focus();}}}}>
        <button className="dismiss" disabled={modal==="deleteAccount"&&busy} autoFocus onClick={closeModal} aria-label={t("close")}>×</button>
        {modal==="deleteAccount"&&<><h2>{t("deleteAccount")}</h2><p>{t("deleteAccountInfo")}</p><form onSubmit={deleteOwnAccount}><label className="check"><input type="checkbox" required disabled={busy} checked={deletionConfirmed} onChange={e=>setDeletionConfirmed(e.target.checked)}/>{t("deleteAccountConsent")}</label><div className="actions"><button className="primary danger-button" type="submit" disabled={busy||!deletionConfirmed}>{t(busy?"deleteAccountBusy":"deleteAccountConfirm")}</button><button className="outline" type="button" disabled={busy} onClick={closeModal}>{t("cancelDeleteAccount")}</button></div></form></>}
        {modal==="frames"&&<><span className="sheet-handle" aria-hidden="true"/><h2>{t("garageAppearance")}</h2><div className="garage-frame-row" aria-label={t("frames")}>
          {frames.map(frame=>{const locked=frame!=="plain"&&!profile?.premium;const equipped=frame===(profile?.premium?profile.frame:"plain");const name=frame==="plain"?t("garageDefaultFrame"):frameTitles[frame];return <button className="garage-frame-option" key={frame} type="button" disabled={busy} aria-label={name+(locked?" · "+t("garageLockedFrame"):"")} aria-pressed={equipped} onClick={()=>chooseFrame(frame)}><span className={"avatar "+frame}>{profile?.avatar?<img src={profile.avatar} alt=""/>:profile?.nickname?.slice(0,1).toUpperCase()??"T"}</span><strong>{name}</strong><span className="garage-frame-state">{locked?<LockKeyhole size={15}/>:equipped?<Check size={15}/>:null}</span></button>;})}
        </div><a className="outline sheet-photo-action" href="/upload/avatar" target="_top"><Camera size={18}/>{t("garageChangePhoto")}</a></>}
        {modal==="premium"&&<>{premiumCard()}<p>{t("garagePerks")}</p></>}
      {modal==="rules" && <><h2>{t("rules")}</h2>{round?.notice&&<p>{round.notice}</p>}{round&&<p>{t("entryDeadline")}: {entryDate(round.submissionsClose)}</p>}{!round?.prize&&<p>{t("usdt")}</p>}<p>{t("help")}</p><p>{t("reactionRule")}</p><p>{t("fair")}</p><p>{t("motorRule")}</p><p>{t("entryLocked")}</p><p>{t("replaceRule")}</p><p>{t("deadlineDefault")}</p></>}
        {modal==="nickname"&&<><h2>{t("nickname")}</h2><p>{t("nicknameHint")}</p><form onSubmit={saveNickname}>
          <label>{t("nickname")}<input name="nickname" autoComplete="nickname" defaultValue={profile?.nickname??""} minLength={3} maxLength={24} required/></label>
          <button className="primary" disabled={busy}>{t("save")}</button></form></>}
        {modal==="withdraw"&&<><h2>{t("withdrawBuild")}</h2><p>{t("replaceRule")}</p><div className="actions"><button className="primary" disabled={busy||submissionsClosed} onClick={withdraw}>{t("withdrawBuild")}</button><button className="outline" disabled={busy} onClick={closeModal}>{t("close")}</button></div></>}
        {modal==="login" && <><h2>{t("login")}</h2><p>{t("loginText")}</p>
          {!data.signedIn&&<a className="primary" href="/api/auth/telegram" target="_top">{t("telegramAccess")}</a>}
          {!data.providers.telegram&&<p className="notice">{t("telegramUnavailable")}</p>}</>}
        {message&&<p className="notice" role="status">{t(message)}</p>}
      </section>
    </div>}
  </div>;
}
