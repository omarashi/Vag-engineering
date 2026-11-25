"use client";
import Image from "next/image";
import { useState } from "react";
import { ArrowRight, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { Mark, Preferences } from "./identity";
import { translate, type Language } from "@/lib/locale";

export function Login({lang,theme,demo}:{lang:Language;theme:string;demo:boolean}){
  const [error,setError]=useState(false);
  const [working,setWorking]=useState(false);
  const tr=(value:string)=>translate(lang,value);
  async function login(email:string,password:string){
    setWorking(true);setError(false);
    try{
      const response=await fetch("/api/auth/sign-in/email",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password,rememberMe:false})});
      if(!response.ok)throw Error();
      window.location.assign("/overview");
    }catch{setError(true);setWorking(false);}
  }
  return <main className="login-page">
    <div className="login-photo">
      <Image src="/login-portrait.jpg" alt={tr("Portrait at the VAG Engineering workshop")} fill
        sizes="(max-width: 700px) 100vw, (max-width: 900px) calc(100vw - 400px), 56vw" preload/>
    </div>
    <section className="login-column">
      <div className="login-toolbar">
        <div className="login-brand"><Mark lang={lang}/></div>
        <div className="login-preferences"><Preferences lang={lang} theme={theme}/></div>
      </div>
      <div className="login-form">
        <div className="login-icon" aria-hidden="true"><ShieldCheck size={25}/></div>
        <h1>{tr("Sign in")}</h1><p>{tr("Enter your workshop account to continue.")}</p>
        <form onSubmit={(event)=>{event.preventDefault();const data=new FormData(event.currentTarget);void login(String(data.get("email")),String(data.get("password")));}}>
          <label>{tr("Email")}<span className="login-input"><Mail size={17}/><input name="email" type="email" autoComplete="username" dir="ltr" required placeholder="name@example.com"/></span></label>
          <label>{tr("Password")}<span className="login-input"><LockKeyhole size={17}/><input name="password" type="password" autoComplete="current-password" required placeholder="••••••••••••"/></span></label>
          {error&&<p role="alert" className="error">{tr("Login failed. Check your credentials or try again shortly.")}</p>}
          <button className="button primary" disabled={working}>{tr(working?"Loading…":"Sign in")}<ArrowRight size={17}/></button>
        </form>
        {demo&&<button className="button secondary demo-login" disabled={working} onClick={()=>login("owner@vag-demo.test","Demo-Workshop-2026!")}>{tr("Open demo workspace")}<ArrowRight size={16}/></button>}
      </div>
    </section>
  </main>;
}

