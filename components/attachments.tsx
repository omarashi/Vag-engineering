"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Paperclip, X } from "lucide-react";
import { message, translate, type Language } from "@/lib/locale";
import { Button, Panel } from "./ui";
import { requestKey } from "@/lib/request-key";

export function Attachments({lang,id,type,allow,files,pdfOnly=false}:{lang:Language;id:string;type:string;allow:boolean;files:{id:string;name:string}[];pdfOnly?:boolean}){
  const router=useRouter();const dialog=useRef<HTMLDialogElement>(null);const [error,setError]=useState("");const [working,setWorking]=useState(false);
  const upload=useRef({key:"",busy:false});
  const tr=(value:string)=>translate(lang,value);
  return <Panel title={tr("Attachments")} icon={<Paperclip size={16}/>}>
    <div className="detail-copy"><div className="page-actions">
      {files.map((file)=><a className="button secondary" key={file.id} href={"/api/attachments/"+file.id}><Paperclip size={14}/><bdi>{file.name}</bdi></a>)}
      {allow&&<Button onClick={()=>{setError("");dialog.current?.querySelector("form")?.reset();upload.current.key="";dialog.current?.showModal();}}><FileUp size={14}/>{tr("Add attachment")}</Button>}
      {!allow&&!files.length&&tr("No records")}
    </div></div>
    {allow&&<dialog className="dialog" ref={dialog} aria-label={tr("Add attachment")} onCancel={event=>{if(upload.current.busy)event.preventDefault();}}><form onSubmit={async(event)=>{
      event.preventDefault();
      if(upload.current.busy)return;
      upload.current.busy=true;
      upload.current.key ||= requestKey();
      setWorking(true);setError("");
      const data=new FormData(event.currentTarget);data.set("target",id);data.set("type",type);
      try{const result=await fetch("/api/attachments",{method:"POST",body:data,headers:{"Idempotency-Key":upload.current.key}});if(!result.ok){setError((await result.json()).error ?? "serverError");return;}
        dialog.current?.close();router.refresh();
      }catch{setError("network");}finally{upload.current.busy=false;setWorking(false);}
    }}><header className="dialog-head"><h2>{tr("Add attachment")}</h2><Button type="button" variant="ghost" disabled={working} onClick={()=>dialog.current?.close()} aria-label={tr("Close")}><X size={17}/></Button></header>
      <div className="dialog-body"><label className="field">{tr("Choose file")}<input name="file" type="file" accept={pdfOnly?".pdf":".pdf,.jpg,.jpeg,.png,.webp"} disabled={working} onChange={()=>{upload.current.key="";setError("");}} required/></label>
      {error&&<p className="error" role="alert">{message(lang,error)}</p>}</div><footer className="dialog-foot">
        <Button type="button" disabled={working} onClick={()=>dialog.current?.close()}>{tr("Cancel")}</Button>
        <Button type="submit" variant="primary" disabled={working}>{tr(working?"Saving…":"Upload")}</Button>
      </footer>
    </form></dialog>}
  </Panel>;
}

