"use client";
import { translate } from "@/lib/locale";
export default function ErrorPage({reset}:{reset:()=>void}){
  const lang=typeof document!=="undefined"&&document.documentElement.lang.startsWith("ar")?"ar":"en";
  return <main className="empty" role="alert"><p>{translate(lang,"Website unavailable")}</p><button className="button secondary" onClick={reset}>{translate(lang,"Back")}</button></main>;
}

