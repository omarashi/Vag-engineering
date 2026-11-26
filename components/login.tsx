"use client";
import { useState } from "react";
import { LockKeyhole, Mail } from "lucide-react";
import { Mark } from "./identity";
import { translate, type Language } from "@/lib/locale";

export function Login({lang,demo}:{lang:Language;theme?:string;demo:boolean}){
  const [error,setError]=useState(false);
  const [forgot,setForgot]=useState(false);
  const [working,setWorking]=useState(false);
  const tr=(value:string)=>translate(lang,value);

  async function login(email:string,password:string,rememberMe=false){
    setWorking(true);setError(false);setForgot(false);
    try{
      const response=await fetch("/api/auth/sign-in/email",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({email,password,rememberMe}),
      });
      if(!response.ok)throw Error();
      window.location.assign("/overview");
    }catch{
      setError(true);
      setWorking(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-backdrop" aria-hidden="true">
        <picture className="login-picture">
          <source media="(max-width: 700px), (max-aspect-ratio: 1/1)" srcSet="/login-phone.jpg"/>
          <img src="/login-desktop.jpg" alt="" className="login-scene-img" draggable={false}/>
        </picture>
      </div>

      <section className="login-card" aria-label={tr("SIGN IN")}>
        <div className="login-logo"><Mark lang={lang}/></div>
        <header className="login-card-head">
          <h1>{tr("SIGN IN")}</h1>
          <p>{tr("WELCOME BACK")}</p>
        </header>

        <form
          className="login-card-form"
          onSubmit={(event)=>{
            event.preventDefault();
            const data=new FormData(event.currentTarget);
            void login(String(data.get("email")),String(data.get("password")),Boolean(data.get("remember")));
          }}
        >
          <label className="login-field">
            <Mail size={17} strokeWidth={1.7} aria-hidden="true"/>
            <input name="email" type="email" autoComplete="username" dir="ltr" required placeholder={tr("Email Address")} aria-label={tr("Email Address")}/>
          </label>

          <label className="login-field">
            <LockKeyhole size={17} strokeWidth={1.7} aria-hidden="true"/>
            <input name="password" type="password" autoComplete="current-password" required placeholder={tr("Password")} aria-label={tr("Password")}/>
          </label>

          <div className="login-options">
            <label className="login-remember">
              <input type="checkbox" name="remember"/>
              <span className="login-checkbox" aria-hidden="true"/>
              <span>{tr("Remember Me")}</span>
            </label>
            <button
              type="button"
              className="login-forgot"
              onClick={()=>{setForgot((open)=>!open);setError(false);}}
            >
              {tr("Forgot Password?")}
            </button>
          </div>

          {error && (
            <p role="alert" className="login-notice error">
              {tr("Login failed. Check your credentials or try again shortly.")}
            </p>
          )}
          {forgot && !error && (
            <p role="status" className="login-notice info">
              {tr("Ask your workshop owner to reset your password.")}
            </p>
          )}

          <button type="submit" className="login-submit" disabled={working}>
            {tr(working?"Loading…":"SIGN IN")}
          </button>
        </form>

      </section>

      {demo && (
        <button
          type="button"
          className="login-demo-btn"
          disabled={working}
          onClick={()=>login("owner@vag-demo.test","Demo-Workshop-2026!")}
        >
          {tr("Open demo workspace")}
        </button>
      )}
    </main>
  );
}
