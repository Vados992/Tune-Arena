"use client";
import { useState } from "react";
import { Check, Copy, Crown, Gift, Send, ShieldCheck, Users, X } from "lucide-react";
import type { Club } from "@/lib/referrals";
import type { Locale } from "@/lib/locale";
import { clubText } from "@/lib/club-strings";

export function ClubReward({club,locale,busy,onDismiss}:{club:Club;locale:Locale;busy:boolean;onDismiss:()=>void}) {
  const t=clubText(locale);
  if (!club.pendingRewardDays && !club.welcomePending) return null;
  return <aside className="club-toast" role="status" aria-live="polite">
    <span className="club-toast-icon"><Gift size={25}/></span><div><strong>
      {club.pendingRewardDays?t.reward.replace("{days}",String(club.pendingRewardDays)):t.welcome}
    </strong><p>{club.pendingRewardDays?t.upgraded:t.welcomeDetail}</p></div>
    <button type="button" disabled={busy} onClick={onDismiss} aria-label={t.dismiss}><X size={20}/></button>
  </aside>;
}

export default function ClubPanel({club,locale,premiumUntil,onLogin}:{club?:Club|null;locale:Locale;premiumUntil?:number;onLogin:()=>void}) {
  const t=clubText(locale),[copied,setCopied]=useState(false),[copyError,setCopyError]=useState(false);
  async function copy() {
    if (!club) return;
    try {await navigator.clipboard.writeText(club.url);setCopied(true);setCopyError(false);}
    catch {setCopyError(true);}
  }
  const telegram=club?"https://t.me/share/url?"+new URLSearchParams({url:club.url,text:t.shareText}).toString():"";
  return <section className="club-panel" aria-labelledby="club-heading" id="tuning-club">
    <div className="club-header"><div><p className="eyebrow">TURBO CLUB / INVITE & UPGRADE</p><h3 id="club-heading">{t.title}</h3><p>{t.subtitle}</p></div>
      <span className="club-reward"><Crown size={22}/><strong>30</strong><small>{t.daysPremium}</small></span></div>
    <div className="club-perks"><span><Users size={18}/>{t.inviterPerk}</span><span><Gift size={18}/>{t.friendPerk}</span></div>
    {club?<>
      <div className="club-progress-label"><strong>{t.activeFriends}: <b>{club.progress}</b> {t.of} {club.goal}</strong>
        <span>{Math.floor(club.progress/club.goal*100)}%</span></div>
      <progress className="club-progress" value={club.progress} max={club.goal} aria-label={t.activeFriends}/>
      <div className="club-milestones" aria-hidden="true">{[1,2,3].map(n=><span key={n} className={n<=club.progress?"complete":""}>
        <i>{n<=club.progress?<Check size={15}/>:n}</i>{n===3?<Crown size={16}/>:<Users size={15}/>}</span>)}</div>
      <p className="club-next">{club.earnedMonths>0?t.nextReward:t.firstReward}</p>
      <div className="club-link"><label htmlFor="club-url">{t.personalLink}</label><input id="club-url" readOnly value={club.url} onFocus={e=>e.currentTarget.select()}/>
        <div className="actions"><button className="primary" type="button" onClick={()=>void copy()}>{copied?<Check size={17}/>:<Copy size={17}/>} {copied?t.copied:t.copy}</button>
          <a className="outline" href={telegram} target="_blank" rel="noopener noreferrer"><Send size={17}/>{t.telegram}</a></div>
        {copied&&<small role="status">{t.copied}</small>}{copyError&&<p role="status">{t.copyHelp}</p>}</div>
      <div className="club-stats"><div><strong>{club.invited}</strong><span>{t.invited}</span></div><div><strong>{club.active}</strong><span>{t.activeTotal}</span></div>
        <div><strong>{club.earnedMonths*30}</strong><span>{t.earnedDays}</span></div></div>
      {club.invited>club.active&&<p className="club-waiting">{t.waiting}: {club.invited-club.active}</p>}
      {!!premiumUntil&&<p className="club-expiry">{t.premiumUntil} {new Intl.DateTimeFormat(locale,{day:"numeric",month:"long",year:"numeric"}).format(new Date(premiumUntil*1000))}</p>}
    </>:<button className="primary" type="button" onClick={onLogin}>{t.signIn}</button>}
    <div className="club-rules"><ShieldCheck size={20}/><div><strong>{t.howActive}</strong><p>{t.activityRule}</p><small>{t.protection}</small></div></div>
    <p className="club-footnote">{t.repeat}</p>
  </section>;
}
