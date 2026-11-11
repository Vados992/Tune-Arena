'use client';
import {useEffect,useState} from 'react';
import {api} from '@/lib/client';
import {useSectionLocale} from './section-header';
import type {Locale} from '@/lib/locale';
import {translate,type Text} from '@/lib/strings';
export default function Welcome({locale}:{locale:Locale}){
 const [activeLocale]=useSectionLocale(locale);
 const [deleted,setDeleted]=useState(false);
 const [ready,setReady]=useState(false),[returning,setReturning]=useState(false);
 function showLogin(){try{localStorage.setItem('ta_known_account','1');}catch{}setReturning(true);}
 const [options,setOptions]=useState<Record<string,boolean>|null>(null),[info,setInfo]=useState('');
 useEffect(()=>{try{setReturning(localStorage.getItem('ta_known_account')==='1');}catch{}setDeleted(new URLSearchParams(location.search).get('deleted')==='1');setReady(true);void api<Record<string,boolean>>('auth/options').then(setOptions).catch(()=>setInfo('Не удалось проверить способы входа. Обнови страницу.'));if(new URLSearchParams(location.search).has('auth'))setInfo('Не удалось завершить вход. Попробуй ещё раз.');},[]);
 const providers=[['telegram','Telegram']];
 const t=(key:Text)=>translate(activeLocale,key);
 if(!ready)return <div className="welcome-shell"><p className="notice" role="status">Загрузка…</p></div>;
 return <div className={"welcome-shell "+(returning?'returning-shell':'')}><header className="header welcome-header"><a href="/" className="brand"><span className="mark" aria-hidden="true">T</span>TUNE<span className="brand-accent">ARENA</span></a>{returning?<button className="outline" onClick={()=>setReturning(false)}>Создать аккаунт</button>:<button className="outline" onClick={showLogin}>У меня уже есть аккаунт</button>}</header>
 <main className="welcome-main">{deleted&&<p className="notice account-deleted-notice" role="status">{t("accountDeleted")}</p>}{!returning&&<section className="welcome-expo"><img src="/images/tune-arena-expo.webp" alt={t('welcomeImage')} width={1672} height={941} fetchPriority="high"/><div className="welcome-photo-label">TUNE ARENA · TUNING CULTURE</div></section>}
 <section className="welcome-copy">{returning?<><span className="eyebrow">ТВОЙ ГАРАЖ ЖДЁТ</span><h1>С возвращением<br/><span>в TUNE ARENA</span></h1><p>Войди через Telegram и возвращайся к своей машине и турам.</p></>:<><span className="eyebrow">STANCE / DRIFT / VIP / OFF-ROAD / MUSCLE / LOWRIDER</span><h1>{t('welcomeTitle')}</h1><p>{t('welcomeIntro')}</p></>}<div className="actions"><a className="primary" href="/?tour=1">Посмотреть туры →</a><a className="outline" href="/?feed=1">{t('welcomeFeed')}</a></div><section className="welcome-registration" id="registration"><h2>{returning?"Войти в аккаунт":"Зарегистрироваться"}</h2><p>Вход и регистрация через Telegram.</p><div className="registration-options">{options?.local&&<form method="post" action="/api/auth/dev"><button className="outline" type="submit">DEMO · Local driver</button></form>}{providers.map(([key,label])=>options?.[key]?<a key={key} className={key==='telegram'?'primary telegram-register':'outline'} href={'/api/auth/'+key} target="_top">Продолжить через {label}</a>:<button key={key} type="button" className={key==='telegram'?'primary telegram-register':'outline'} onClick={()=>setInfo(options?'Вход через '+label+' ещё не подключён организатором.':'Проверяем доступность входа…')}>Продолжить через {label}<small>{options?'Пока не подключён':'Проверяем…'}</small></button>)}</div>{info&&<p className="notice" role="status">{info}</p>}<button className="text-button account-mode-switch" onClick={()=>returning?setReturning(false):showLogin()}>{returning?"Впервые здесь? Создать аккаунт":"Уже зарегистрирован? Войти"}</button></section></section></main></div>;
}
