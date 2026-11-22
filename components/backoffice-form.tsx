"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "./ui";
import { label, message, translate, type Language } from "@/lib/locale";
import { requestKey } from "@/lib/request-key";

export type Option={value:string;name:string;related?:string;price?:string;cost?:string;version?:number};
export type Field={key:string;label:string;type?:"text"|"textarea"|"select"|"multi"|"check"|"date"|"datetime-local"|"month"|"password"|"email";value?:string|boolean|string[];required?:boolean;options?:Option[];wide?:boolean;ltr?:boolean;depends?:string};
export type ActionSpec={action:string;title:string;fields?:Field[];hidden?:Record<string,unknown>;post?:boolean;editor?:"lines"|"returns"|"allocations";options?:Option[];parts?:Option[];services?:Option[];onlyParts?:boolean;purchase?:boolean;destination?:string;initialLines?:Row[];initialAllocation?:Record<string,string>;dynamic?:Record<string,Field[]>};
type Data=Record<string,unknown>;
type Row=Record<string,string>;
const makeLine=(onlyParts?:boolean):Row=>({kind:onlyParts?"part":"service",description:"",partId:"",quantity:"1",price:"",discount:"0"});
export function ActionForm({lang,spec,primary=false,auto=false}:{lang:Language;spec:ActionSpec;primary?:boolean;auto?:boolean}){
  const dialog=useRef<HTMLDialogElement>(null);
  const router=useRouter();
  const tr=(name:string)=>translate(lang,name);
  const [state,setState]=useState<Data>(spec.hidden ?? {});
  const [rows,setRows]=useState<Row[]>([]);
  const [confirmed,setConfirmed]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [working,setWorking]=useState(false);
  const [showForm,setShowForm]=useState(false);
  const request=useRef<{key:string;body:string;uncertain:boolean}|null>(null);
  const fields=[...(spec.fields ?? []),...(spec.dynamic?.[String(state.kind)] ?? [])];
  const initial=()=>Object.fromEntries([...(spec.fields ?? []),...(spec.dynamic?.[String(spec.fields?.find((field)=>field.key==="kind")?.value ?? "")] ?? [])]
    .map((field)=>[field.key,field.value ?? (field.type==="check"?false:field.type==="multi"?[]:"")]));
  function open(){
    setState({...spec.hidden,...initial()});
    setRows(spec.editor==="lines" ? (spec.initialLines?.length ? spec.initialLines : [makeLine(spec.onlyParts)])
      : spec.initialAllocation ? [spec.initialAllocation] : []);
    setConfirmed(false);setError("");setShowForm(true);
  }
  useLayoutEffect(()=>{if(showForm&&!dialog.current?.open)dialog.current?.showModal();},[showForm]);
  useEffect(()=>{if(auto&&!dialog.current?.open)open();/* Run once for the requested create action. */},[]); // eslint-disable-line react-hooks/exhaustive-deps
  function update(key:string,value:unknown){
    setState((previous)=>{
      const next={...previous,[key]:value};
      for(const field of fields) if(field.depends===key) next[field.key]="";
      if(key==="kind" && spec.dynamic) {
        for(const group of Object.values(spec.dynamic)) for(const field of group) delete next[field.key];
        for(const field of spec.dynamic[String(value)] ?? []) next[field.key]=field.value ?? (field.type==="check"?false:"");
      }
      return next;
    });
  }
  function changeRow(index:number,key:string,value:string){
    setRows((items)=>items.map((row,position)=>{
      if(position!==index)return row;
      if(key==="partId"){
        const selected=spec.parts?.find((item)=>item.value===value);
        return {...row,partId:value,description:selected?.name ?? "",price:(spec.purchase?selected?.cost:selected?.price) ?? ""};
      }
      if(key==="serviceId"){
        const selected=spec.services?.find((item)=>item.value===value);
        return {...row,serviceId:value,description:selected?.name ?? "",price:selected?.price ?? ""};
      }
      return {...row,[key]:value};
    }));
  }
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(working)return;
    if(spec.post&&!confirmed){setConfirmed(true);return;}
    const payload={...state};
    if(spec.editor){
      payload[spec.editor==="allocations"?"allocations":"lines"]=spec.initialAllocation?[{documentId:spec.initialAllocation.documentId,amount:String(state.amount ?? "")}]:rows;
    }
    if (spec.action==="stock" && state.kind==="count") payload.version=spec.fields?.find((field)=>field.key==="partId")?.options?.find((option)=>option.value===state.partId)?.version;
    if (spec.action==="settings") {
      payload.prefixes=Object.fromEntries(Object.entries(payload).filter(([key])=>key.startsWith("prefix-")).map(([key,value])=>[key.slice(7),value]));
    }
    const body=JSON.stringify(payload);
    setWorking(true);setError("");
    try {
      let result:Response | undefined;
      if(request.current?.uncertain) {
        const lookup=await fetch("/api/requests/"+request.current.key,{cache:"no-store"});
        if(lookup.ok){result=lookup;}
        else if(lookup.status!==404)throw Error();
        else if(request.current.body!==body){
          setError("network");return;
        }
      }
      if(!result){
        if(!request.current || request.current.body!==body)request.current={key:requestKey(),body,uncertain:false};
        result=await fetch("/api/actions/"+spec.action,{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":request.current.key},body});
      }
      const data=await result.json();
      if(!result.ok){
        if(result.status>=500){if(request.current)request.current.uncertain=true;}
        else request.current=null;
        setError(data.error ?? "serverError");setConfirmed(false);return;
      }
      request.current=null;dialog.current?.close();setNotice(data.warning?message(lang,data.warning):tr("Saved"));
      window.setTimeout(()=>setNotice(""),4200);
      if(spec.destination) router.push(spec.destination.replace("$id",data.id));
      else if(auto) router.replace(window.location.pathname);
      router.refresh();
    }catch{
      if(request.current)request.current.uncertain=true;
      setError("network");setConfirmed(false);
    }finally{setWorking(false);}
  }
  function control(field:Field){
    const value=state[field.key];
    const options=(field.options ?? []).filter((option)=>!field.depends || !state[field.depends] || option.related===state[field.depends]);
    const shared={name:field.key,required:field.required,dir:field.ltr?"ltr":undefined};
    if(field.type==="textarea")return <textarea {...shared} rows={3} value={String(value ?? "")} onChange={(event)=>update(field.key,event.target.value)}/>;
    if(field.type==="check")return <input type="checkbox" name={field.key} checked={value===true} onChange={(event)=>update(field.key,event.target.checked)}/>;
    if(field.type==="select")return <select {...shared} value={String(value ?? "")} onChange={(event)=>update(field.key,event.target.value)}><option value="">{tr("Select…")}</option>{options.map((option)=><option key={option.value} value={option.value}>{option.name}</option>)}</select>;
    if(field.type==="multi")return <select {...shared} multiple value={Array.isArray(value)?value:[]} onChange={(event)=>update(field.key,[...event.target.selectedOptions].map((option)=>option.value))}>{options.map((option)=><option key={option.value} value={option.value}>{option.name}</option>)}</select>;
    return <input {...shared} type={field.type ?? "text"} value={String(value ?? "")} autoComplete={field.type==="password"?"new-password":undefined} onChange={(event)=>update(field.key,event.target.value)}/>;
  }
  const paymentTargets:Record<string,string[]>={receipt:["invoice","customerOpening"],supplierPayment:["purchase","supplierOpening"],refund:["credit"],supplierRefund:["supplierCredit"],expensePayment:["expense"],salaryPayment:["payroll","employeeOpening"],advance:["payroll","employeeOpening"]};
  const editableAllocation=spec.editor==="allocations" && !spec.initialAllocation && (spec.action!=="payment" || Boolean(paymentTargets[String(state.kind)]));
  const relevant=editableAllocation&&showForm ? (spec.options ?? []).filter((option)=>spec.action!=="payment" ||
    (!state.partyId || option.related?.split("|")[0]===state.partyId) &&
    (!state.employeeId || option.related?.split("|")[1]===state.employeeId) &&
    paymentTargets[String(state.kind)]?.includes(option.related?.split("|")[2] ?? "")) : [];
  return <>
    <Button type="button" variant={primary?"primary":"secondary"} onClick={open}>{primary&&<Plus size={15}/>} {tr(spec.title)}</Button>
    <dialog className="dialog" ref={dialog} aria-label={tr(spec.title)}
      onClose={()=>{if(!dialog.current?.open)setShowForm(false);}}
      onCancel={(event)=>{if(working || request.current?.uncertain)event.preventDefault();}}>
      {showForm&&<form onSubmit={submit} onInvalid={(event)=>{
        const field=event.target;
        if(field instanceof HTMLInputElement||field instanceof HTMLTextAreaElement||field instanceof HTMLSelectElement){
          if(lang==="ar")field.setCustomValidity(message(lang,"invalid"));
        }
      }} onInputCapture={(event)=>{
        const field=event.target;
        if(field instanceof HTMLInputElement||field instanceof HTMLTextAreaElement||field instanceof HTMLSelectElement)field.setCustomValidity("");
      }}>
        <header className="dialog-head"><h2>{tr(spec.title)}</h2><button className="icon-button" type="button" disabled={working || Boolean(request.current?.uncertain)} aria-label={tr("Close")} onClick={()=>dialog.current?.close()}><X size={20}/></button></header>
        <div className="dialog-body">
          <div className="form-grid">{fields.map((field)=><label key={field.key} className={"field "+(field.wide?"wide ":"")+(field.type==="check"?"check":"")}><span>{tr(field.label)}{field.required&&<em aria-hidden="true">*</em>}</span>{control(field)}</label>)}</div>
          {(spec.editor==="lines"||spec.editor==="returns"||editableAllocation)&&<div className="line-editor">
            <div className="line-head"><b>{tr(editableAllocation?"Allocations":"Line items")}</b><Button type="button" onClick={()=>setRows((items)=>[...items,spec.editor==="lines"?makeLine(spec.onlyParts):spec.editor==="returns"?{sourceId:"",quantity:"1",disposition:"none"}:{documentId:"",amount:""}])}><Plus size={14}/>{tr(editableAllocation?"Add allocation":"Add line")}</Button></div>
            {rows.map((row,index)=><div className="line-row" key={index}>
              {spec.editor==="lines"&&<>
                {!spec.onlyParts&&<label className="field">{tr("Type")}<select value={row.kind} onChange={(event)=>changeRow(index,"kind",event.target.value)}>{["service","labor","part","supplied"].map((key)=><option key={key} value={key}>{label(lang,key)}</option>)}</select></label>}
                {row.kind==="part"&&<label className="field">{tr("Part")}<select required value={row.partId} onChange={(event)=>changeRow(index,"partId",event.target.value)}><option value="">{tr("Select…")}</option>{spec.parts?.map((option)=><option key={option.value} value={option.value}>{option.name}</option>)}</select></label>}
                {row.kind==="service"&&!!spec.services?.length&&<label className="field">{tr("Service catalogue")}<select value={row.serviceId ?? ""} onChange={(event)=>changeRow(index,"serviceId",event.target.value)}><option value="">{tr("Select…")}</option>{spec.services.map((option)=><option key={option.value} value={option.value}>{option.name}</option>)}</select></label>}
                <label className="field">{tr("Description")}<input required value={row.description} onChange={(event)=>changeRow(index,"description",event.target.value)}/></label>
                {(["quantity","price","discount"] as const).map((field)=><label className="field" key={field}>{tr(field[0].toUpperCase()+field.slice(1))}<input dir="ltr" inputMode="decimal" required={field!=="discount"} value={row[field]} onChange={(event)=>changeRow(index,field,event.target.value)}/></label>)}
              </>}
              {spec.editor==="returns"&&<>
                <label className="field">{tr("Description")}<select required value={row.sourceId} onChange={(event)=>changeRow(index,"sourceId",event.target.value)}><option value="">{tr("Select…")}</option>{spec.options?.map((option)=><option key={option.value} value={option.value}>{option.name}</option>)}</select></label>
                <label className="field">{tr("Quantity")}<input inputMode="decimal" dir="ltr" required value={row.quantity} onChange={(event)=>changeRow(index,"quantity",event.target.value)}/></label>
                <label className="field">{tr("Stock disposition")}<select value={row.disposition} onChange={(event)=>changeRow(index,"disposition",event.target.value)}>{["none",spec.purchase?"remove":"restock"].map((key)=><option value={key} key={key}>{label(lang,key)}</option>)}</select></label>
              </>}
              {editableAllocation&&<>
                <label className="field">{tr("Document")}<select required value={row.documentId} onChange={(event)=>changeRow(index,"documentId",event.target.value)}><option value="">{tr("Select…")}</option>{relevant.map((option)=><option key={option.value} value={option.value}>{option.name}</option>)}</select></label>
                <label className="field">{tr("Amount")}<input required dir="ltr" inputMode="decimal" value={row.amount} onChange={(event)=>changeRow(index,"amount",event.target.value)}/></label>
              </>}
              <Button type="button" variant="ghost" onClick={()=>setRows((items)=>items.filter((_,position)=>position!==index))}>{tr("Remove line")}</Button>
            </div>)}
          </div>}
          {confirmed&&<p className="notice" role="status">{tr("Posting will update the linked records.")}</p>}
          {error&&<p className="error" role="alert">{message(lang,error)}</p>}
        </div>
        <footer className="dialog-foot"><Button type="button" disabled={working||Boolean(request.current?.uncertain)} onClick={()=>dialog.current?.close()}>{tr("Cancel")}</Button>
          <Button type="submit" variant="primary" disabled={working}>{tr(working?"Saving…":confirmed?"Confirm posting":spec.post?"Post":"Save")}</Button></footer>
      </form>}
    </dialog>
    {notice&&<div role="status" className="notice toast">{notice}</div>}
  </>;
}

