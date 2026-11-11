'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/client';
type MiniApp={initData:string;ready:()=>void;expand:()=>void;BackButton?:{show:()=>void;hide:()=>void;onClick:(fn:()=>void)=>void;offClick:(fn:()=>void)=>void}};
declare global{interface Window{Telegram?:{WebApp?:MiniApp}}}
let pending:Promise<{ok:boolean;changed:boolean}>|null=null;
export default function TelegramRuntime({children}:{children:React.ReactNode}){
 const [state,setState]=useState<'checking'|'ready'|'failed'>('checking');
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let active=true;const mini=window.Telegram?.WebApp;
  if(!mini?.initData||new URLSearchParams(location.search).get('deleted')==='1'){setState('ready');return;}
  mini.ready();mini.expand();
  const back=()=>{if(location.pathname!=='/')location.assign('/?feed=1');else window.dispatchEvent(new Event('tune-arena-back'));};
  mini.BackButton?.show();mini.BackButton?.onClick(back);
  setState('checking');
  pending??=api<{ok:boolean;changed:boolean}>('auth/telegram/mini','POST',{initData:mini.initData}).then(result=>{if(result.ok!==true)throw new Error('invalid_session');return result;});
  void pending.then(result=>{
   if(!active)return;
   if(result.changed)location.replace(location.pathname+location.search);
   else setState('ready');
  }).catch(()=>{if(active)setState('failed');});
  return()=>{active=false;mini.BackButton?.offClick(back);mini.BackButton?.hide();};
 },[attempt]);
 if(state==='ready')return children;
 return <main className="shell"><section className="panel" role={state==='failed'?'alert':'status'}><h1>TUNE ARENA</h1>{state==='failed'?<><p>Не удалось подтвердить вход через Telegram. Попробуй ещё раз или закрой и заново открой приложение через кнопку бота.</p><button className="primary" onClick={()=>{pending=null;setAttempt(n=>n+1);}}>Попробовать снова</button></>:<p>Подключаем Telegram…</p>}</section></main>;
}
