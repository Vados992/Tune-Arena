"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { accessText, type AccessText } from "@/lib/access-strings";
import type { Locale } from "@/lib/locale";

type Member={id:string;nickname:string;canCreate:number;rounds:number};
type Assignment={id:string;nickname:string;assigned:number};
type Event={id:string;action:string;nickname:string|null;title:string|null;created:number};

export default function StaffAccess({locale,roundId,roundTitle}:{locale:Locale;roundId:string;roundTitle?:string}) {
  const [members,setMembers]=useState<Member[]>([]),[assignments,setAssignments]=useState<Assignment[]>([]),[events,setEvents]=useState<Event[]>([]);
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
  const [error,setError]=useState<AccessText|null>(null),[saved,setSaved]=useState(false);
  const t=(key:AccessText)=>accessText(locale,key);
  useEffect(()=>{
    let active=true;setReady(false);setAssignments([]);
    void Promise.all([
      api<{members:Member[];events:Event[]}>("admin/access"),
      roundId?api<{members:Assignment[]}>("admin/access/rounds/"+roundId):Promise.resolve({members:[]}),
    ]).then(([people,scope])=>{if(active){setMembers(people.members);setEvents(people.events);setAssignments(scope.members);setReady(true);}})
      .catch(e=>{if(active){setError(e instanceof Error&&e.message==="forbidden"?"forbidden":"error");setReady(true);}});
    return ()=>{active=false;};
  },[roundId,revision]);
  async function run(action:()=>Promise<unknown>,done?:()=>void) {
    setBusy(true);setError(null);setSaved(false);
    try {await action();done?.();setSaved(true);setRevision(n=>n+1);}
    catch(e){const key=e instanceof Error?e.message:"";setError(key==="profile_not_found"||key==="owner_protected"||key==="forbidden"?key:"error");}
    finally {setBusy(false);}
  }
  const actions=new Set<AccessText>(["organizer_granted","organizer_create_enabled","organizer_revoked","round_assigned","round_unassigned","round_created"]);
  return <details className="panel control-panel staff-access" open>
    <summary>{t("heading")}</summary>
    <p>{t("intro")}</p><p className="staff-hint">{t("hint")}</p>
    {error&&<p className="notice" role="alert">{t(error)}</p>}
    {saved&&<p className="notice" role="status">{t("saved")}</p>}
    <form className="admin-form" onSubmit={e=>{
      e.preventDefault();const form=e.currentTarget,f=new FormData(form);
      void run(()=>api("admin/access","POST",{nickname:f.get("nickname"),canCreate:f.get("canCreate")==="on"}),()=>form.reset());
    }}>
      <label>{t("nickname")}<input name="nickname" required maxLength={25} autoComplete="off"/></label>
      <label className="staff-check"><input name="canCreate" type="checkbox"/>{t("create")}</label>
      <button className="primary" disabled={busy||!ready}>{t("grant")}</button>
    </form>
    <h3>{t("members")}</h3>
    {ready&&!members.length&&<p>{t("none")}</p>}
    <ul className="staff-members">{members.map(m=><li key={m.id}>
      <div><strong>@{m.nickname}</strong><small>{t("assigned")}: {m.rounds}</small></div>
      <label className="staff-check"><input type="checkbox" checked={!!m.canCreate} disabled={busy||!ready}
        onChange={e=>void run(()=>api("admin/access","POST",{nickname:m.nickname,canCreate:e.target.checked}))}/>{t("create")}</label>
      <button className="outline" disabled={busy||!ready} onClick={()=>void run(()=>api("admin/access/revoke","POST",{userId:m.id}))}>{t("revoke")} · @{m.nickname}</button>
    </li>)}</ul>
    <h3>{t("scope")}{roundTitle?" · "+roundTitle:""}</h3>
    {!roundId?<p>{t("choose")}</p>:<div className="staff-assignments">{assignments.map(m=><label className="staff-check" key={m.id}>
      <input type="checkbox" checked={!!m.assigned} disabled={busy||!ready} onChange={e=>void run(()=>api("admin/access/rounds/"+roundId,"PUT",{userId:m.id,assigned:e.target.checked}))}/>@{m.nickname}
    </label>)}</div>}
    <details><summary>{t("log")}</summary><ul className="activity-list">{events.map(e=><li key={e.id}>
      <time dateTime={new Date(e.created*1000).toISOString()}>{new Intl.DateTimeFormat(locale,{dateStyle:"short",timeStyle:"short"}).format(e.created*1000)}</time>
      <span>{actions.has(e.action as AccessText)?t(e.action as AccessText):e.action} · @{e.nickname??"—"}{e.title?" · "+e.title:""}</span>
    </li>)}</ul></details>
  </details>;
}
