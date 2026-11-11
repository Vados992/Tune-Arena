"use client";
import { useEffect, useState } from "react";
import { languages, language, type Locale } from "@/lib/locale";
import { translate } from "@/lib/strings";

const labels={en:"English",pt:"Português",es:"Español",ru:"Русский",uk:"Українська",fr:"Français"};

export function useSectionLocale(initial:Locale) {
  const [locale,setLocale]=useState(initial);
  useEffect(()=>{
    const saved=language(localStorage.getItem("ta_language")??"");
    if (saved) setLocale(saved);
  },[]);
  useEffect(()=>{document.documentElement.lang=locale;},[locale]);
  function change(next:Locale) {
    localStorage.setItem("ta_language",next);
    setLocale(next);
  }
  return [locale,change] as const;
}

export default function SectionHeader({locale,change,area}:{
  locale:Locale;change:(next:Locale)=>void;area:"admin"|"winners";
}) {
  const t=(key:"viewContest"|"winners"|"language"|"admin")=>translate(locale,key);
  return <>
    <header className="header">
      <a href="/" className="brand"><span className="mark" aria-hidden="true">T</span><span>TUNE<span className="brand-accent">ARENA</span></span></a>
      <a className="outline" href="/">Главное меню</a>
      <select aria-label={t("language")} value={locale} onChange={e=>change(e.target.value as Locale)}>
        {languages.map(l=><option value={l} key={l}>{labels[l]}</option>)}
      </select>
    </header>
    {area!=="winners"&&<nav className="tabs section-nav" aria-label="Tune Arena">
      <a href="/">{t("viewContest")}</a>
      <a href="/trophies">Трофеи</a>
      <a href="/winners">{t("winners")}</a>
      {area==="admin"&&<a className="admin-link" href="/admin" aria-current="page">{t("admin")}</a>}
    </nav>}
  </>;
}
