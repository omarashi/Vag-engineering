"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Paperclip, X } from "lucide-react";
import { message, translate, type Language } from "@/lib/locale";
import { Button, Panel } from "./ui";

export function Attachments({lang,id,type,allow,files}:{lang:Language;id:string;type:string;allow:boolean;files:{id:string;name:string}[]}){
  const router=useRouter();const dialog=useRef<HTMLDialogElement>(null);const [error,setError]=useState("");const [working,setWorking]=useState(false);
  const tr=(value:string)=>translate(lang,value);
  return <Panel title={tr("Attachments")} icon={<Paperclip size={16}/>}>
    <div className="detail-copy"><div className="page-actions">
      {files.map((file)=><a className="button secondary" key={file.id} href={"/api/attachments/"+file.id}><Paperclip size={14}/><bdi>{file.name}</bdi></a>)}
      {allow&&<Button onClick={()=>{setError("");dialog.current?.showModal();}}><FileUp size={14}/>{tr("Add attachment")}</Button>}
      {!allow&&!files.length&&tr("No records")}
    </div></div>
    {allow&&<dialog className="dialog" ref={dialog} aria-label={tr("Add attachment")}><form onSubmit={async(event)=>{
      event.preventDefault();setWorking(true);setError("");
      const data=new FormData(event.currentTarget);data.set("target",id);data.set("type",type);
      try{const result=await fetch("/api/attachments",{method:"POST",body:data});if(!result.ok){setError((await result.json()).error ?? "serverError");return;}
        dialog.current?.close();router.refresh();
      }catch{setError("network");}finally{setWorking(false);}
    }}><header className="dialog-head"><h2>{tr("Add attachment")}</h2><Button type="button" variant="ghost" onClick={()=>dialog.current?.close()} aria-label={tr("Close")}><X size={17}/></Button></header>
      <div className="dialog-body"><label className="field">{tr("Choose file")}<input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" required/></label>
      {error&&<p className="error" role="alert">{message(lang,error)}</p>}</div><footer className="dialog-foot"><Button variant="primary" disabled={working}>{tr(working?"Saving…":"Upload")}</Button></footer>
    </form></dialog>}
  </Panel>;
}

