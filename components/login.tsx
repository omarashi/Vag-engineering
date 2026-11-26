"use client";
import Image from "next/image";
import { useState } from "react";
import { LockKeyhole, UserRound } from "lucide-react";
import type { Language } from "@/lib/locale";

const loginArabic = {
  "SIGN IN": "تسجيل الدخول",
  "WELCOME BACK": "مرحبًا بعودتك",
  "Username": "اسم المستخدم",
  "Password": "كلمة المرور",
  "Remember Me": "تذكّرني",
  "Login failed. Check your credentials or try again shortly.": "تعذّر تسجيل الدخول. تحقّق من اسم المستخدم وكلمة المرور، أو حاول مرة أخرى بعد قليل.",
  "Loading…": "جارٍ تسجيل الدخول…",
};

function LoginSceneLogo(){
  return <>
    <svg className="login-logo-filter" aria-hidden="true" focusable="false" width="0" height="0">
      <filter id="login-anchor-neon" x="-20%" y="-25%" width="140%" height="150%" colorInterpolationFilters="sRGB">
        {/* Isolate the red anchor by its red–green difference and keep the original lettering. */}
        <feColorMatrix in="SourceGraphic" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  3 -3 0 0 -.2" result="red"/>
        <feComposite in="red" in2="SourceAlpha" operator="in" result="anchor"/>
        <feComposite in="SourceGraphic" in2="anchor" operator="out" result="lettering"/>
        <feMorphology in="anchor" operator="erode" radius="1.6" result="interior"/>
        <feComposite in="anchor" in2="interior" operator="out" result="outline"/>
        <feFlood floodColor="#ff6356" result="tubeColor"/>
        <feComposite in="tubeColor" in2="outline" operator="in" result="tube"/>
        <feFlood floodColor="#f82317" floodOpacity=".23" result="redGlass"/>
        <feComposite in="redGlass" in2="anchor" operator="in" result="dimAnchor"/>
        <feGaussianBlur in="tube" stdDeviation="8" result="wallGlow"/>
        <feDropShadow in="tube" dx="0" dy="0" stdDeviation="2.5" floodColor="#ff190c" result="neon"/>
        <feMerge>
          <feMergeNode in="wallGlow"/>
          <feMergeNode in="dimAnchor"/>
          <feMergeNode in="neon"/>
          <feMergeNode in="lettering"/>
        </feMerge>
      </filter>
    </svg>
    <Image className="login-scene-logo" src="/login-vag-logo.png" alt="VAG Engineering" width={669} height={373} loading="eager" unoptimized/>
  </>;
}

export function Login({lang}:{lang:Language}){
  const [error,setError]=useState(false);
  const [working,setWorking]=useState(false);
  const tr=(value:keyof typeof loginArabic)=>lang==="ar"?loginArabic[value]:value;

  async function login(username:string,password:string,rememberMe=false){
    setWorking(true);setError(false);
    try{
      const response=await fetch("/api/auth/sign-in/username",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({username,password,rememberMe}),
      });
      if(!response.ok)throw Error();
      window.location.assign("/overview");
    }catch{
      setError(true);
      setWorking(false);
    }
  }

  return (
    <main className="login-page" lang={lang}>
      <LoginSceneLogo/>
      <section className="login-card" aria-label={tr("SIGN IN")}>
        <header className="login-card-head">
          <h1>{tr("SIGN IN")}</h1>
          <p>{tr("WELCOME BACK")}</p>
        </header>

        <form
          className="login-card-form"
          onSubmit={(event)=>{
            event.preventDefault();
            const data=new FormData(event.currentTarget);
            void login(String(data.get("username")),String(data.get("password")),data.has("rememberMe"));
          }}
        >
          <label className="login-field">
            <UserRound size={17} strokeWidth={1.7} aria-hidden="true"/>
            <input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={30} dir="ltr" required placeholder={tr("Username")} aria-label={tr("Username")}/>
          </label>

          <label className="login-field">
            <LockKeyhole size={17} strokeWidth={1.7} aria-hidden="true"/>
            <input name="password" type="password" autoComplete="current-password" required placeholder={tr("Password")} aria-label={tr("Password")}/>
          </label>

          <label className="login-remember">
            <input type="checkbox" name="rememberMe"/>
            <span className="login-checkbox" aria-hidden="true"/>
            <span>{tr("Remember Me")}</span>
          </label>

          {error && (
            <p role="alert" className="login-notice">
              {tr("Login failed. Check your credentials or try again shortly.")}
            </p>
          )}

          <button type="submit" className="login-submit" disabled={working}>
            {tr(working?"Loading…":"SIGN IN")}
          </button>
        </form>

      </section>

    </main>
  );
}
