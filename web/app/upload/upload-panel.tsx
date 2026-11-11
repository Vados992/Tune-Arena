"use client";
import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {ArrowLeft,Check,UserRound} from "lucide-react";
import PhotoPicker from "../photo-picker";
import {useSectionLocale} from "../section-header";
import {api,errorLabel} from "@/lib/client";
import {translate,type Text} from "@/lib/strings";
import type {Locale} from "@/lib/locale";

type Profile={nickname:string|null;premium:boolean;avatar?:string|null};
type OwnEntry={id:string;name:string;description:string;withdrawn:number;moderation_state?:string};
type Round={id:string;title:string;opens?:number;closes:number;submissionsClose:number;serverTime:number;closed:boolean;submissionsClosed:boolean};
type Model={signedIn:boolean;profile:Profile;round?:Round;myEntry?:OwnEntry|null};
export default function UploadPanel({kind,roundId,initialLanguage}:{kind:"avatar"|"entry";roundId?:string;initialLanguage:Locale}) {
  const [locale]=useSectionLocale(initialLanguage),t=(key:Text)=>translate(locale,key);
  const [data,setData]=useState<Model|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState<Text|null>(null);
  const [photo,setPhoto]=useState<File|null>(null),[photoBusy,setPhotoBusy]=useState(false),[saving,setSaving]=useState(false),[saved,setSaved]=useState(false),[removed,setRemoved]=useState(false);
  const [clockNow,setClockNow]=useState(0),[returnTo,setReturnTo]=useState("/upload/"+kind);
  const clock=useRef({server:0,local:0});
  const avatar=kind==="avatar",title=avatar?"avatarUpload":"garageUploadCar";
  const load=useCallback(async()=>{
    setLoading(true);setError(null);
    try {const next=await api<Model>("state"+(roundId?"?round="+encodeURIComponent(roundId):""));clock.current={server:next.round?.serverTime??0,local:Date.now()};setClockNow(next.round?.serverTime??0);setData(next);}
    catch(e){setError(errorLabel(e));}finally{setLoading(false);}
  },[roundId]);
  useEffect(()=>{setReturnTo(location.pathname+location.search);void load();},[load]);
  useEffect(()=>{if(avatar||!data?.round)return;const timer=setInterval(()=>setClockNow(clock.current.server+Math.max(0,Math.floor((Date.now()-clock.current.local)/1000))),1000);return()=>clearInterval(timer);},[avatar,data?.round?.id]);
  const round=data?.round;
  const now=clockNow;
  const own=data?.myEntry,replace=!!own&&!!data?.profile.premium;
  let blocked:Text|null=null;
  if(!avatar){
    if(!round)blocked="uploadNoRound";
    else if(round.closed||now>=round.closes)blocked="finished";
    else if(round.submissionsClosed||now>=round.submissionsClose)blocked="submissionsClosed";
    else if(round.opens&&now<round.opens)blocked="uploadNotStarted";
    else if(own&&!data?.profile.premium)blocked="entryLocked";
    else if(own?.moderation_state==="pending")blocked="garagePending";
    else if(own?.moderation_state==="rejected")blocked="garageRejected";
  }
  const signIn="/api/auth/telegram";
  const back=avatar?"/?garage=1":round?"/?round="+encodeURIComponent(round.id):"/";
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!data?.signedIn||saving||photoBusy||!photo||blocked)return;
    const form=new FormData(event.currentTarget);form.set("photo",photo);setSaving(true);setError(null);
    try {
      if(avatar)await api("profile/avatar","PUT",form);
      else {
        if(!data.profile.nickname){await api("profile/nickname","PUT",{nickname:form.get("nickname")});form.delete("nickname");}
        await api("rounds/"+round!.id+"/entries"+(replace?"/"+own!.id:""),replace?"PUT":"POST",form);
      }
      setSaved(true);
    } catch(e){setError(errorLabel(e));}finally{setSaving(false);}
  }
  async function remove(){
    if(!data?.signedIn||saving)return;setSaving(true);setError(null);
    try {await api("profile/avatar","DELETE");setData({...data,profile:{...data.profile,avatar:null}});setRemoved(true);}
    catch(e){setError(errorLabel(e));}finally{setSaving(false);}
  }
  return <div className="shell upload-shell">
    <header className="header"><a className="brand" href="/"><span className="mark" aria-hidden="true">T</span>TUNE<span className="brand-accent">ARENA</span></a><a className="outline" href="/">Главное меню</a><a className="outline upload-back" href={back}><ArrowLeft size={17}/>{t("uploadBack")}</a></header>
    <main className="upload-main"><section className="panel upload-panel"><p className="eyebrow">TUNE ARENA</p><h1>{t(title)}</h1>
      {loading&&<p role="status">{t("garageLoading")}</p>}
      {error&&<p className="notice" role="alert">{t(error)}{!data&&<button className="outline" type="button" onClick={()=>void load()}>{t("again")}</button>}</p>}
      {!loading&&data&&!saved&&<>
        {!avatar&&round&&<p className="upload-round">{round.title||t("nightNeon")} · {t("entryDeadline")}: <time dateTime={new Date(round.submissionsClose*1000).toISOString()}>{new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Lisbon"}).format(round.submissionsClose*1000)}</time></p>}
        {blocked&&<p className="notice upload-explanation" role="status">{t(blocked)}</p>}
        {!data.signedIn?<div className="upload-signin"><p>{t("uploadSignIn")}</p><a className="primary" href={signIn} target="_top">{t("telegramAccess")}</a></div>:<form className="upload-form" onSubmit={submit}>
          {avatar?<><p>{t("avatarHint")}</p>{data.profile.avatar&&<img className="upload-current-avatar" src={data.profile.avatar} alt={t("garageAppearance")}/>}</>:<>
            {!data.profile.nickname&&<label>{t("nickname")}<input name="nickname" minLength={3} maxLength={24} autoComplete="nickname" required/><small>{t("nicknameHint")}</small></label>}
            <label>{t("name")}<input name="name" defaultValue={own?.name??""} required maxLength={55}/></label><label>{t("desc")}<textarea name="description" defaultValue={own?.description??""} required maxLength={160} rows={3}/></label>
          </>}
          <PhotoPicker key="photo" locale={locale} onChange={file=>{setPhoto(file);if(file)setError(null);}} onBusy={setPhotoBusy} onError={()=>{}}/>
          {!avatar&&<><label className="check"><input type="checkbox" name="rights" value="yes" required/>{t("rights")}</label>{replace&&<label className="check"><input type="checkbox" name="resetConsent" value="yes" required/>{t("resetConsent")}</label>}</>}
          <div className="actions"><button className="primary" type="submit" disabled={saving||photoBusy||!photo||!!blocked}>{saving?t("uploadSaving"):t(avatar?"avatarSave":replace?"replaceBuild":"publish")}</button>{avatar&&data.profile.avatar&&<button className="outline" type="button" disabled={saving||photoBusy} onClick={()=>void remove()}>{t("avatarRemove")}</button>}</div>
          {removed&&<p role="status">{t("uploadAvatarRemoved")}</p>}
        </form>}
      </>}
      {saved&&<div className="upload-success" role="status"><Check size={28}/><h2>{t(avatar?"uploadAvatarSaved":"published")}</h2><a className="primary" href={avatar?"/?garage=1":back}>{t("uploadDone")}</a></div>}
      {error==="loginText"&&data?.signedIn&&<a className="outline" href={signIn} target="_top">{t("telegramAccess")}</a>}
    </section></main>
  </div>;
}
