"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "./ui";
import Link from "./navigation-link";
import { label, message, translate, type Language } from "@/lib/locale";
import { postFormAction, type PendingAction } from "@/lib/action-request";
import { PurchaseLineFields, type PurchaseQuoteOption } from "./purchase-line";
import { PurchaseProductPicker } from "./purchase-product-picker";
import { useDialogDismiss } from "./use-dialog-dismiss";

export type Option={value:string;name:string;related?:string;price?:string;cost?:string;version?:number};
export type Field={key:string;label:string;type?:"text"|"textarea"|"select"|"multi"|"check"|"date"|"datetime-local"|"month"|"password"|"email";value?:string|boolean|string[];required?:boolean;options?:Option[];wide?:boolean;ltr?:boolean;depends?:string;inputMode?:"decimal"};
export type ActionSpec={action:string;title:string;fields?:Field[];hidden?:Record<string,unknown>;post?:boolean;editor?:"lines"|"returns"|"allocations";options?:Option[];parts?:Option[];services?:Option[];onlyParts?:boolean;purchase?:boolean;purchaseQuotes?:PurchaseQuoteOption[];destination?:string;initialLines?:Row[];initialAllocation?:Record<string,string>;dynamic?:Record<string,Field[]>};
type Data=Record<string,unknown>;
type Row=Record<string,string>;
const makeLine=(onlyParts?:boolean):Row=>({kind:onlyParts?"part":"service",description:"",partId:"",quantity:"1",price:"",discount:"0"});
export function ActionForm({lang,spec,primary=false,auto=false,source}:{lang:Language;spec:ActionSpec;primary?:boolean;auto?:boolean;source?:{href:string;label:string}}){
  const dialog=useRef<HTMLDialogElement>(null);
  const router=useRouter();
  const tr=(name:string)=>translate(lang,name);
  const [state,setState]=useState<Data>(spec.hidden ?? {});
  const [rows,setRows]=useState<Row[]>([]);
  const [confirmed,setConfirmed]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [working,setWorking]=useState(false);
  const [step,setStep]=useState<"closed"|"source"|"form">("closed");
  const [dirty,setDirty]=useState(false);
  const showForm=step==="form";
  const request=useRef<PendingAction|null>(null);
  const submitting=useRef(false);
  const uncertain=Boolean(request.current?.uncertain);
  const {finish,dismiss}=useDialogDismiss(dialog,step!=="closed",lang,dirty,working||uncertain);
  const fields=(spec.fields ?? []).flatMap((field)=>field.key==="kind"
    ? [field,...(spec.dynamic?.[String(state.kind)] ?? [])] : [field]);
  const initial=()=>Object.fromEntries([...(spec.fields ?? []),...(spec.dynamic?.[String(spec.fields?.find((field)=>field.key==="kind")?.value ?? "")] ?? [])]
    .map((field)=>[field.key,field.value ?? (field.type==="check"?false:field.type==="multi"?[]:"")]));
  function open(){
    setState({...spec.hidden,...initial()});
    setRows(spec.editor==="lines" ? (spec.initialLines?.length ? spec.initialLines : [makeLine(spec.onlyParts)])
      : spec.initialAllocation ? [spec.initialAllocation] : []);
    setConfirmed(false);setError("");setDirty(false);setStep("form");
  }
  useLayoutEffect(()=>{
    if(step==="closed")return;
    if(!dialog.current?.open)dialog.current?.showModal();
    if(step==="form" && source)dialog.current?.querySelector("input")?.focus();
  },[step,source]);
  useEffect(()=>{if(auto&&!dialog.current?.open)open();/* Run once for the requested create action. */},[]); // eslint-disable-line react-hooks/exhaustive-deps
  function update(key:string,value:unknown){
    setDirty(true);
    setConfirmed(false);
    if(spec.editor==="allocations" && ["kind","partyId","employeeId"].includes(key)) setRows([]);
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
  function editRows(next:SetStateAction<Row[]>){
    setDirty(true);
    setConfirmed(false);
    setRows(next);
  }
  function changeRow(index:number,key:string,value:string){
    editRows((items)=>items.map((row,position)=>{
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
    if(submitting.current)return;
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
    submitting.current=true;
    setWorking(true);setError("");
    try {
      const {ok,data}=await postFormAction(spec.action,body,request);
      if(!ok){
        setError(data.error ?? "serverError");setConfirmed(false);return;
      }
      setDirty(false);
      setNotice(data.warning?message(lang,data.warning):tr("Saved"));
      window.setTimeout(()=>setNotice(""),4200);
      finish(()=>{
        if(spec.destination) router.push(spec.destination.replace("$id",data.id));
        else if(auto) router.replace(window.location.pathname);
        router.refresh();
      });
    }catch{
      setError("network");setConfirmed(false);
    }finally{submitting.current=false;setWorking(false);}
  }
  function control(field:Field){
    const value=state[field.key];
    const options=(field.options ?? []).filter((option)=>!field.depends || !state[field.depends] || option.related===state[field.depends]);
    const shared={name:field.key,required:field.required,dir:field.ltr?"ltr":undefined};
    if(field.type==="textarea")return <textarea {...shared} rows={3} value={String(value ?? "")} onChange={(event)=>update(field.key,event.target.value)}/>;
    if(field.type==="check")return <input type="checkbox" name={field.key} checked={value===true} onChange={(event)=>update(field.key,event.target.checked)}/>;
    if(field.type==="select")return <select {...shared} value={String(value ?? "")} onChange={(event)=>update(field.key,event.target.value)}><option value="">{tr("Select…")}</option>{options.map((option)=><option key={option.value} value={option.value}>{option.name}</option>)}</select>;
    if(field.type==="multi")return <select {...shared} multiple value={Array.isArray(value)?value:[]} onChange={(event)=>update(field.key,[...event.target.selectedOptions].map((option)=>option.value))}>{options.map((option)=><option key={option.value} value={option.value}>{option.name}</option>)}</select>;
    return <input {...shared} type={field.type ?? "text"} inputMode={field.inputMode ?? (field.key==="phone"?"tel":undefined)} value={String(value ?? "")}
      autoCapitalize={field.key==="username"?"none":undefined} spellCheck={field.key==="username"?false:undefined}
      autoComplete={field.type==="password"?"new-password":field.key==="phone"?"tel":field.type==="email"?"email":undefined} onChange={(event)=>update(field.key,event.target.value)}/>;
  }
  const paymentTargets:Record<string,string[]>={receipt:["invoice","customerOpening"],supplierPayment:["purchase","supplierOpening"],refund:["credit"],supplierRefund:["supplierCredit"],expensePayment:["expense"],salaryPayment:["payroll","employeeOpening"],advance:["payroll","employeeOpening"]};
  const editableAllocation=spec.editor==="allocations" && !spec.initialAllocation && (spec.action!=="payment" || Boolean(paymentTargets[String(state.kind)]));
  const relevant=editableAllocation&&showForm ? (spec.options ?? []).filter((option)=>spec.action!=="payment" ||
    (!state.partyId || option.related?.split("|")[0]===state.partyId) &&
    (!state.employeeId || option.related?.split("|")[1]===state.employeeId) &&
    paymentTargets[String(state.kind)]?.includes(option.related?.split("|")[2] ?? "")) : [];
  const heading=<header className="dialog-head"><h2>{tr(spec.title)}</h2><button className="icon-button" type="button" disabled={working || uncertain} aria-label={tr("Close")} onClick={()=>dismiss()}><X size={20}/></button></header>;
  return <>
    <Button type="button" variant={primary?"primary":"secondary"} onClick={source?()=>setStep("source"):open}>{primary&&<Plus size={15}/>} {tr(spec.title)}</Button>
    <dialog className="dialog" ref={dialog} aria-label={tr(spec.title)}
      onClose={()=>{if(!dialog.current?.open)setStep("closed");}}
      onCancel={(event)=>{event.preventDefault();dismiss();}}>
      {step==="source"&&source&&<>
        {heading}
        <div className="dialog-body"><div className="form-grid">
          <Button asChild variant="primary"><Link href={source.href} onNavigate={event=>{event.preventDefault();dismiss(()=>router.push(source.href));}}>{tr(source.label)}</Link></Button>
          <Button type="button" onClick={open}>{tr("Add manually")}</Button>
        </div></div>
      </>}
      {showForm&&<form onSubmit={submit} onInvalid={(event)=>{
        const field=event.target;
        if(field instanceof HTMLInputElement||field instanceof HTMLTextAreaElement||field instanceof HTMLSelectElement){
          if(lang==="ar")field.setCustomValidity(message(lang,"invalid"));
        }
      }} onInputCapture={(event)=>{
        const field=event.target;
        if(field instanceof HTMLInputElement||field instanceof HTMLTextAreaElement||field instanceof HTMLSelectElement)field.setCustomValidity("");
      }}>
        {heading}
        <div className="dialog-body">
          <div className="contents" inert={working||uncertain}>
          <div className="form-grid">{fields.map((field)=><label key={field.key} className={"field "+(field.wide?"wide ":"")+(field.type==="check"?"check":"")}><span>{tr(field.label)}{field.required&&<em aria-hidden="true">*</em>}</span>{control(field)}</label>)}</div>
          {(spec.editor==="lines"||spec.editor==="returns"||editableAllocation)&&<div className="line-editor">
            <div className="line-head"><b>{tr(editableAllocation?"Allocations":"Line items")}</b><Button type="button" onClick={()=>editRows((items)=>[...items,spec.editor==="lines"?makeLine(spec.onlyParts):spec.editor==="returns"?{sourceId:"",quantity:"1",disposition:"none"}:{documentId:"",amount:""}])}><Plus size={14}/>{tr(editableAllocation?"Add allocation":"Add line")}</Button></div>
            {rows.map((row,index)=><div className="line-row" key={index}>
              {spec.editor==="lines"&&(spec.purchaseQuotes ? <PurchaseLineFields lang={lang} row={row} parts={spec.parts ?? []} quotes={spec.purchaseQuotes}
                onChange={(next)=>editRows((items)=>items.map((item,position)=>position===index?next:item))}/> : <>
                {!spec.onlyParts&&<label className="field">{tr("Type")}<select value={row.kind} onChange={(event)=>changeRow(index,"kind",event.target.value)}>{["service","labor","part","supplied"].map((key)=><option key={key} value={key}>{label(lang,key)}</option>)}</select></label>}
                {row.kind==="part"&&(spec.purchase ?
                  <PurchaseProductPicker lang={lang} title="Search inventory" options={spec.parts ?? []} value={row.partId}
                    onSelect={(value)=>changeRow(index,"partId",value)}/> :
                  <label className="field">{tr("Part")}<select required value={row.partId} onChange={(event)=>changeRow(index,"partId",event.target.value)}><option value="">{tr("Select…")}</option>{spec.parts?.map((option)=><option key={option.value} value={option.value}>{option.name}</option>)}</select></label>)}
                {row.kind==="service"&&!!spec.services?.length&&<label className="field">{tr("Service catalogue")}<select value={row.serviceId ?? ""} onChange={(event)=>changeRow(index,"serviceId",event.target.value)}><option value="">{tr("Select…")}</option>{spec.services.map((option)=><option key={option.value} value={option.value}>{option.name}</option>)}</select></label>}
                <label className="field">{tr("Description")}<input required value={row.description} onChange={(event)=>changeRow(index,"description",event.target.value)}/></label>
                {(["quantity","price","discount"] as const).map((field)=><label className="field" key={field}>{tr(field[0].toUpperCase()+field.slice(1))}<input dir="ltr" inputMode="decimal" required={field!=="discount"} value={row[field]} onChange={(event)=>changeRow(index,field,event.target.value)}/></label>)}
              </>)}
              {spec.editor==="returns"&&<>
                <label className="field">{tr("Description")}<select required value={row.sourceId} onChange={(event)=>changeRow(index,"sourceId",event.target.value)}><option value="">{tr("Select…")}</option>{spec.options?.map((option)=><option key={option.value} value={option.value}>{option.name}</option>)}</select></label>
                <label className="field">{tr("Quantity")}<input inputMode="decimal" dir="ltr" required value={row.quantity} onChange={(event)=>changeRow(index,"quantity",event.target.value)}/></label>
                <label className="field">{tr("Stock disposition")}<select value={row.disposition} onChange={(event)=>changeRow(index,"disposition",event.target.value)}>{["none",spec.purchase?"remove":"restock"].map((key)=><option value={key} key={key}>{label(lang,key)}</option>)}</select></label>
              </>}
              {editableAllocation&&<>
                <label className="field">{tr("Document")}<select required value={row.documentId} onChange={(event)=>changeRow(index,"documentId",event.target.value)}><option value="">{tr("Select…")}</option>{relevant.map((option)=><option key={option.value} value={option.value}>{option.name}</option>)}</select></label>
                <label className="field">{tr("Amount")}<input required dir="ltr" inputMode="decimal" value={row.amount} onChange={(event)=>changeRow(index,"amount",event.target.value)}/></label>
              </>}
              <Button type="button" variant="ghost" onClick={()=>editRows((items)=>items.filter((_,position)=>position!==index))}>{tr("Remove line")}</Button>
            </div>)}
          </div>}
          </div>
          {confirmed&&<p className="notice" role="status">{tr("Posting will update the linked records.")}</p>}
          {error&&<p className="error" role="alert">{message(lang,error)}</p>}
        </div>
        <footer className="dialog-foot"><Button type="button" disabled={working||uncertain} onClick={()=>dismiss()}>{tr("Cancel")}</Button>
          <Button type="submit" variant="primary" disabled={working}>{tr(working?"Saving…":uncertain?"Try again":confirmed?"Confirm posting":spec.post?"Post":"Save")}</Button></footer>
      </form>}
    </dialog>
    {notice&&<div role="status" className="notice toast">{notice}</div>}
  </>;
}

