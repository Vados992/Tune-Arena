"use client";
import { useState } from "react";
import { Check, Copy, Gift, X } from "lucide-react";
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

export default function ClubPanel({club,locale,onLogin}:{club?:Club|null;locale:Locale;onLogin:()=>void}) {
  const t=clubText(locale),[copied,setCopied]=useState(false),[copyError,setCopyError]=useState(false);
  async function copy() {
    if (!club) return;
    try {await navigator.clipboard.writeText(club.url);setCopied(true);setCopyError(false);}
    catch {setCopyError(true);}
  }
  return <section className="panel garage-referrals" aria-labelledby="club-heading" id="tuning-club" data-garage-section="referrals">
    <div className="garage-section-heading"><h2 id="club-heading">{t.title}</h2><strong>{club?.progress??0} {t.of} {club?.goal??3} {t.friends}</strong></div>
    <progress className="club-progress" value={club?.progress??0} max={club?.goal??3} aria-label={t.activeFriends}/>
    <p className="garage-muted">{t.inviterPerk}</p>
    {club?<><div className="garage-referral-link"><input aria-label={t.personalLink} readOnly value={club.url} onFocus={e=>e.currentTarget.select()}/><button className="outline" type="button" onClick={()=>void copy()}>{copied?<Check size={17}/>:<Copy size={17}/>} {copied?t.copied:t.copy}</button></div>
    {copied&&<small role="status">{t.copied}</small>}{copyError&&<p role="status">{t.copyHelp}</p>}</>:<button className="outline" type="button" onClick={onLogin}>{t.signIn}</button>}
  </section>;
}
