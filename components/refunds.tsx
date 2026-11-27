import Form from "next/form";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { day, label, money, translate, type Language } from "@/lib/locale";
import { paymentChannelField } from "@/lib/payment-options";
import { refundableInvoices, refundBatchDetail } from "@/lib/refund-views";
import { today } from "@/lib/rules";
import { receiptAccounts } from "@/lib/visit-forms";
import { chargeLabels, isChargeType } from "@/lib/workshop-charges";
import { DocumentTable } from "./bill-items";
import { RefundForm } from "./refund-form";
import { Heading, PrintLink, Ref, Register } from "./register";
import { PrintButton } from "./print-button";
import { ButtonLink, Panel } from "./ui";

export async function Refunds({lang,partyId,invoiceId}:{lang:Language;partyId?:string;invoiceId?:string}){
  const [customers,accounts,history]=await Promise.all([
    db.party.findMany({where:{kind:"customer",archived:false},orderBy:{name:"asc"},select:{id:true,name:true,phone:true}}),receiptAccounts(),
    db.refundBatch.findMany({where:{partyId:partyId||undefined},orderBy:{createdAt:"desc"},take:50,include:{party:{select:{name:true}},
      notes:{select:{number:true,total:true,status:true}}}}),
  ]);
  const customer=customers.find(({id})=>id===partyId);
  if(partyId&&!customer)notFound();
  const invoices=customer?await refundableInvoices(customer.id):[];
  if(invoiceId&&!invoices.some((row)=>row.id===invoiceId))notFound();
  const t=(key:string)=>translate(lang,key);
  return <><Heading lang={lang} title="Refund / Return">
    {customer&&<ButtonLink href={"/customers/"+customer.id+"#customer-balance"}>{t("Customer balance")}</ButtonLink>}
  </Heading>
    <Form action="/refunds" className="toolbar" prefetch={false}>
      <label className="field">{t("Customer")}<select name="party" defaultValue={customer?.id ?? ""} required>
        <option value="">{t("Select…")}</option>{customers.map((row)=><option value={row.id} key={row.id}>{row.name}{row.phone?" · "+row.phone:""}</option>)}
      </select></label>
      <button type="submit" className="button secondary">{t("Show invoices")}</button>
    </Form>
    <div className="detail-stack">
      {customer&&<Panel title={customer.name}>
        {invoices.some((row)=>BigInt(row.remaining)>0n)?<RefundForm lang={lang} partyId={customer.id} invoices={invoices} initial={invoiceId}
          key={customer.id+"-"+(invoiceId ?? "")} date={today()} accounts={paymentChannelField(lang,accounts,"Refund paid from").options ?? []}/>:
          <p className="detail-copy">{t("No refundable invoices")}</p>}
      </Panel>}
      <Panel title={t("Refund history")}><Register lang={lang} head={["Date","Customer","Credit notes","Credit note total","Action"]} rows={history.map((row)=>[
        day(lang,row.at),row.party.name,row.notes.map((note)=>note.number).join(" · "),money(lang,row.notes.reduce((sum,note)=>note.status==="posted"?sum+note.total:sum,0n)),
        <Ref href={"/refunds/"+row.id}>{t("View refund")}</Ref>,
      ])}/></Panel>
    </div></>;
}

export async function RefundReceipt({ lang,id,print=false }:{lang:Language;id:string;print?:boolean}) {
  const data=await refundBatchDetail(id);
  if(!data)notFound();
  const {batch,entries}=data;
  const t=(key:string)=>translate(lang,key);
  const amt=(amount:bigint)=><bdi>{money(lang,amount)}</bdi>;
  const details=<>
    <p>{t("Customer")} <bdi>{batch.party.name}</bdi></p>
    <p>{t("Date")} <bdi>{day(lang,batch.at)}</bdi></p>
    <p>{t("Refund reference")} <bdi>{entries.map(({note})=>note.number).join(" · ")}</bdi></p>
    <p>{t("Reason")} <bdi>{batch.reason}</bdi></p>
    {entries.map(({note,payouts,refunded,applied,debtReduced,retained})=><section key={note.id} className="receipt-bill">
      <header><h2>{t("Credit note")} {print?<bdi>{note.number}</bdi>:<Ref href={"/record/"+note.id}>{note.number}</Ref>}</h2>
        <p>{t("Original invoice")} {note.source&&(print?<bdi>{note.source.number}</bdi>:<Ref href={"/record/"+note.source.id}>{note.source.number}</Ref>)}</p>
        {note.status!=="posted"&&<p>{label(lang,note.status)}</p>}
      </header>
      {note.lines.length>0&&<div className={print?undefined:"table-scroll"}><DocumentTable lang={lang} headers={["Description","Quantity","Physical return","Amount"]}
        rows={note.lines.map((line)=>[isChargeType(line.purpose)?t(chargeLabels[line.purpose]):line.description,line.quantity.isZero()?"—":line.quantity.toFixed(),
          line.returnDisposition==="restock"?t("Return to sellable inventory"):line.returnDisposition==="damaged"?t("Returned damaged"):t("Financial adjustment only"),amt(line.total)])}/></div>}
      <dl className="receipt-totals">{[["Credit note total",note.total],["Invoice debt reduction",debtReduced],["Refunds paid",refunded],
        ["Applied customer credit",applied],["Credit retained",retained]].map(([key,value])=><div key={String(key)}><dt>{t(String(key))}</dt><dd>{amt(BigInt(value))}</dd></div>)}</dl>
      {(payouts.length>0||note.creditUses.length>0)&&<div className="page-actions">
        {payouts.map((item)=>{
          const text=item.payment.number+" · "+money(lang,item.amount)+(item.payment.reversedAt?" · "+label(lang,"reversed"):"");
          return print?<bdi key={item.id}>{text}</bdi>:<Ref key={item.id} href={"/payment/"+item.payment.id}>{text}</Ref>;
        })}
        {note.creditUses.map((entry)=>{
          if(!entry.invoice)return null;
          const text=entry.invoice.number+" · "+money(lang,entry.amount)+(entry.reversedAt?" · "+label(lang,"reversed"):"");
          return print?<bdi key={entry.id}>{text}</bdi>:<Ref key={entry.id} href={"/record/"+entry.invoice.id}>{text}</Ref>;
        })}
      </div>}
    </section>)}
    {entries.length>1&&<dl className="receipt-totals">{[["Credit note total",entries.reduce((sum,row)=>row.note.status==="posted"?sum+row.note.total:sum,0n)],
      ["Invoice debt reduction",entries.reduce((sum,row)=>sum+row.debtReduced,0n)],["Refunds paid",entries.reduce((sum,row)=>sum+row.refunded,0n)],
      ["Applied customer credit",entries.reduce((sum,row)=>sum+row.applied,0n)],["Credit retained",entries.reduce((sum,row)=>sum+row.retained,0n)]].map(([key,value])=>
        <div key={String(key)}><dt>{t(String(key))}</dt><dd>{amt(BigInt(value))}</dd></div>)}</dl>}
  </>;
  if(print)return <main className="doc-screen"><div className="print-actions">
    <ButtonLink href={"/refunds/"+id}>{t("Back")}</ButtonLink>
    <ButtonLink href={"/print/refund/"+id+"?lang=en"}>English</ButtonLink><ButtonLink href={"/print/refund/"+id+"?lang=ar"}>مصري</ButtonLink>
    <PrintButton text={t("Print A4")}/></div>
    <article className="print-sheet receipt-print" dir={lang==="ar"?"rtl":"ltr"} lang={lang==="ar"?"ar-EG":"en"}>
      <h1>{t("Refund receipt")}</h1>{details}
    </article></main>;
  return <><Heading lang={lang} title="Refund receipt"><PrintLink lang={lang} type="refund" id={id}/>
    <ButtonLink href={"/customers/"+batch.partyId+"#customer-balance"}>{t("Customer balance")}</ButtonLink>
  </Heading><Panel title={t("Refund breakdown")}><div className="detail-copy">{details}</div></Panel></>;
}
