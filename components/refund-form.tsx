"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { postFormAction, type PendingAction } from "@/lib/action-request";
import { divideHalfUp, normalize, parseMoney } from "@/lib/decimal-input";
import { day, message, money, translate, type Language } from "@/lib/locale";
import { chargeLabels, isChargeType } from "@/lib/workshop-charges";
import type { refundableInvoices } from "@/lib/refund-views";
import { Button } from "./ui";

type Invoice=Awaited<ReturnType<typeof refundableInvoices>>[number];
type Entry={mode:"quantity"|"amount";value:string;disposition:string};
type Selection={full:boolean;lines:Record<string,Entry>};
const empty:Selection={full:false,lines:{}};

function thousandths(input:string) {
  const match=/^(\d{1,13})(?:\.(\d{1,3}))?$/.exec(normalize(input));
  return match?BigInt(match[1]+(match[2] ?? "").padEnd(3,"0")):0n;
}

function lineValue(line:Invoice["lines"][number], entry:Entry) {
  const available=BigInt(line.remainingValue);
  if(entry.mode==="amount"){
    const amount=parseMoney(entry.value);
    return amount!==null&&amount>0n&&amount<=available?amount:null;
  }
  const quantity=thousandths(entry.value);
  const remaining=thousandths(line.remainingQuantity);
  if(quantity<=0n||quantity>remaining||(entry.disposition==="restock"&&quantity>thousandths(line.restockQuantity)))return null;
  const proportional=divideHalfUp(BigInt(line.originalValue)*quantity,thousandths(line.originalQuantity));
  return quantity===remaining||proportional>available?available:proportional;
}

export function RefundForm({lang,partyId,invoices,initial,accounts,date}:{
  lang:Language;partyId:string;invoices:Invoice[];initial?:string;date:string;accounts:{value:string;name:string}[];
}){
  const router=useRouter();
  const pending=useRef<PendingAction|null>(null);
  const lock=useRef(false);
  const [selected,setSelected]=useState<Record<string,Selection>>(initial&&invoices.some((row)=>row.id===initial)?{[initial]:empty}:{});
  const [settlement,setSettlement]=useState("");
  const [destinationId,setDestination]=useState("");
  const [paymentChannel,setChannel]=useState("");
  const [paidOut,setPaidOut]=useState(false);
  const [reason,setReason]=useState("");
  const [at,setAt]=useState(date);
  const [preview,setPreview]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const t=(key:string)=>translate(lang,key);
  const choices=invoices.filter((invoice)=>Object.hasOwn(selected,invoice.id));
  const breakdown=choices.map((invoice)=>{
    const selection=selected[invoice.id];
    const values=invoice.lines.filter((line)=>selection.lines[line.id]).map((line)=>lineValue(line,selection.lines[line.id]));
    const total=selection.full?BigInt(invoice.remaining):values.reduce<bigint>((sum,value)=>sum+(value ?? 0n),0n);
    const debt=BigInt(invoice.balance);
    return {invoice,total,available:total>debt?total-debt:0n,valid:total>0n&&total<=BigInt(invoice.remaining)&&(selection.full||values.every((value)=>value!==null))};
  });
  const total=breakdown.reduce((sum,row)=>sum+row.total,0n);
  const available=breakdown.reduce((sum,row)=>sum+row.available,0n);
  const destinations=invoices.filter((row)=>!selected[row.id]&&BigInt(row.balance)>0n&&BigInt(row.balance)>=available);
  const mayApply=available>0n&&destinations.length>0;
  const mayPay=available>0n&&accounts.length>0;
  const validSettlement=settlement==="keep"||(settlement==="apply"&&mayApply&&destinations.some((row)=>row.id===destinationId))||
    (settlement==="payout"&&mayPay&&Boolean(paymentChannel)&&paidOut);
  function change(invoiceId:string,updater:(value:Selection)=>Selection){
    setSelected((previous)=>({...previous,[invoiceId]:updater(previous[invoiceId] ?? empty)}));
    setPreview(false);setError("");setPaidOut(false);
  }
  function toggleInvoice(invoiceId:string){
    setSelected((previous)=>Object.hasOwn(previous,invoiceId)?Object.fromEntries(Object.entries(previous).filter(([key])=>key!==invoiceId)):
      {...previous,[invoiceId]:empty});
    setPreview(false);setError("");setPaidOut(false);
  }
  function updateLine(invoiceId:string,lineId:string,value:Entry){
    change(invoiceId,(current)=>({...current,lines:{...current.lines,[lineId]:value}}));
  }
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(lock.current)return;
    if(!breakdown.length||breakdown.length>20||breakdown.some((row)=>!row.valid)||!validSettlement||!reason.trim()||!at){setError("invalidRefundSelection");return;}
    if(!preview){setPreview(true);return;}
    lock.current=true;setBusy(true);setError("");
    try{
      const invoices=choices.map(({id})=>({invoiceId:id,...(selected[id].full?{full:true}:{lines:Object.entries(selected[id].lines).map(([sourceId,entry])=>({
        sourceId,disposition:entry.mode==="quantity"?entry.disposition:"none",[entry.mode]:entry.value,
      }))})}));
      const {ok,data}=await postFormAction("customerRefund",JSON.stringify({partyId,at,reason,settlement,destinationId,paymentChannel,invoices,paidOut,
        expectedTotal:String(total),expectedAvailable:String(available)}),pending);
      if(ok){router.push("/refunds/"+data.id+"?saved=1");router.refresh();}
      else{setError(data.error ?? "serverError");if(!pending.current?.uncertain)setPreview(false);}
    }catch{setError("network");}finally{lock.current=false;setBusy(false);}
  }
  return <form className="detail-copy" onSubmit={submit}>
    <div className="detail-stack" inert={busy||Boolean(pending.current?.uncertain)}>
      {invoices.filter((invoice)=>BigInt(invoice.remaining)>0n).map((invoice)=>{
        const selection=selected[invoice.id];
        return <fieldset key={invoice.id} className="invoice-price-list">
          <legend><label><input type="checkbox" checked={Boolean(selection)} onChange={()=>toggleInvoice(invoice.id)}/> <bdi>{invoice.number}</bdi> · <bdi>{day(lang,invoice.at)}</bdi></label></legend>
          {selection&&<>
            <p>{t("Remaining refundable value")} <bdi>{money(lang,invoice.remaining)}</bdi> · {t("Remaining debt")} <bdi>{money(lang,invoice.balance)}</bdi></p>
            <label className="log-checkbox-option"><input type="checkbox" checked={selection.full} onChange={(event)=>change(invoice.id,()=>({full:event.target.checked,lines:{}}))}/>
              <span>{t("Credit the full remaining invoice value")}</span></label>
            {selection.full?<p>{t("Use item quantities below to return any stock to inventory.")}</p>:invoice.lines.map((line)=>{
              const entry=selection.lines[line.id];
              const lineName=isChargeType(line.purpose)?t(chargeLabels[line.purpose]):line.description;
              return <div className="invoice-price-list" key={line.id}>
                <label className="log-checkbox-option"><input type="checkbox" checked={Boolean(entry)} onChange={(event)=>{
                  if(event.target.checked)updateLine(invoice.id,line.id,{mode:line.physical&&thousandths(line.remainingQuantity)>0n?"quantity":"amount",value:"",disposition:"none"});
                  else change(invoice.id,(current)=>({...current,lines:Object.fromEntries(Object.entries(current.lines).filter(([id])=>id!==line.id))}));
                }}/><span><bdi>{lineName}</bdi> · <bdi>{money(lang,line.remainingValue)}</bdi></span></label>
                {entry&&<div className="form-grid">
                  {line.physical&&thousandths(line.remainingQuantity)>0n&&<label className="field">{t("Refund basis")}<select value={entry.mode} onChange={(event)=>updateLine(invoice.id,line.id,{mode:event.target.value as Entry["mode"],value:"",disposition:"none"})}>
                    <option value="quantity">{t("Quantity")}</option><option value="amount">{t("Financial adjustment only")}</option></select></label>}
                  <label className="field">{t(entry.mode==="quantity"?"Quantity":"Refund amount (EGP)")}<input inputMode="decimal" dir="ltr" value={entry.value}
                    placeholder={entry.mode==="quantity"?line.remainingQuantity:undefined} onChange={(event)=>updateLine(invoice.id,line.id,{...entry,value:event.target.value})}/></label>
                  {entry.mode==="quantity"&&<label className="field">{t("Physical return")}<select value={entry.disposition} onChange={(event)=>updateLine(invoice.id,line.id,{...entry,disposition:event.target.value})}>
                    <option value="none">{t("No physical return")}</option><option value="damaged">{t("Returned damaged")}</option>
                    {thousandths(line.restockQuantity)>0n&&<option value="restock">{t("Return to sellable inventory")}</option>}</select></label>}
                </div>}
              </div>;
            })}
          </>}
        </fieldset>;
      })}
      <div className="form-grid">
        <label className="field">{t("Date")}<input type="date" required dir="ltr" max={date} value={at} onChange={(event)=>{setAt(event.target.value);setPreview(false);}}/></label>
        <label className="field">{t("Settlement")}<select required value={settlement} onChange={(event)=>{setSettlement(event.target.value);setPreview(false);}}>
          <option value="">{t("Select…")}</option><option value="keep">{t(available>0n?"Keep as customer credit":"Reduce outstanding invoice debt")}</option>
          {mayApply&&<option value="apply">{t("Apply customer credit")}</option>}{mayPay&&<option value="payout">{t("Pay cash or bank refund")}</option>}
        </select></label>
        {settlement==="apply"&&mayApply&&<label className="field">{t("Unpaid invoice")}<select required value={destinationId} onChange={(event)=>{setDestination(event.target.value);setPreview(false);}}>
          <option value="">{t("Select…")}</option>{destinations.map((row)=><option value={row.id} key={row.id}>{row.number} · {money(lang,row.balance)}</option>)}
        </select></label>}
        {settlement==="payout"&&mayPay&&<label className="field">{t("Refund paid from")}<select required value={paymentChannel} onChange={(event)=>{setChannel(event.target.value);setPreview(false);}}>
          <option value="">{t("Select…")}</option>{accounts.map((row)=><option value={row.value} key={row.value}>{row.name}</option>)}
        </select><small>{t("Record a payout only after money is returned.")}</small></label>}
        {settlement==="payout"&&mayPay&&<label className="log-checkbox-option"><input type="checkbox" required checked={paidOut}
          onChange={(event)=>{setPaidOut(event.target.checked);setPreview(false);}}/><span>{t("I have returned the refund amount to the customer")}</span></label>}
        <label className="field wide">{t("Reason")}<textarea required rows={2} maxLength={2000} value={reason} onChange={(event)=>{setReason(event.target.value);setPreview(false);}}/></label>
      </div>
    </div>
    {breakdown.length>0&&<div className="invoice-price-list" aria-label={t("Refund breakdown")}>
      {breakdown.map(({invoice,total,available})=><div className="invoice-price-row" key={invoice.id}><span><bdi>{invoice.number}</bdi> · {t("Remaining debt")}: <bdi>{money(lang,BigInt(invoice.balance)-total+available)}</bdi></span><strong><bdi>{money(lang,total)}</bdi></strong></div>)}
      <div className="invoice-price-row"><strong>{t("Credit note total")}</strong><bdi>{money(lang,total)}</bdi></div>
      <div className="invoice-price-row"><span>{t("Invoice debt reduction")}</span><bdi>{money(lang,total-available)}</bdi></div>
      <div className="invoice-price-row"><span>{t(settlement==="payout"?"Refunds paid":settlement==="apply"?"Applied customer credit":"Credit retained")}</span><bdi>{money(lang,available)}</bdi></div>
    </div>}
    {error&&<p role="alert" className="error">{message(lang,error)}</p>}
    <Button type="submit" variant="primary" disabled={busy}>{t(busy?"Saving…":pending.current?.uncertain?"Try again":preview?"Confirm refund":"Review refund")}</Button>
  </form>;
}
