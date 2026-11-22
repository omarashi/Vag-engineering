import { headers } from "next/headers";
import { notFound,redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { currentUser } from "@/lib/auth";
import { documentDetail,payments,statement } from "@/lib/views";
import { day,label,money,translate,type Language } from "@/lib/locale";
import { PrintButton } from "@/components/print-button";
import { BillItems, DocumentTable as Grid } from "@/components/bill-items";
import { ReceiptItems } from "@/components/receipt-items";
import { receiptDetails } from "@/lib/receipt-details";

type Snapshot={business?:{name:string;phone?:string;address?:string;footer?:string;logo?:string;dateFormat?:"short"|"medium"|"long"};
  party?:{name:string;phone?:string;address?:string};employee?:{name:string;phone?:string};vehicle?:{plate?:string;make?:string;model?:string}};
export default async function Page({params,searchParams}:{params:Promise<{type:string;id:string}>;searchParams:Promise<{lang?:string}>}){
  const [{type,id},query,request]=await Promise.all([params,searchParams,headers()]);
  if(!await currentUser(request))redirect("/login");
  const lang=query.lang==="ar"?"ar":"en";
  const tr=(name:string)=>translate(lang,name);
  const [doc,pay,account]=await Promise.all([type==="record"?documentDetail(id):null,type==="payment"?payments({},id).then((rows)=>rows[0]):null,type==="statement"?statement(id):null]);
  if(doc?.kind==="appointment" || !doc&&!pay&&!account)notFound();
  const snap=(doc?.snapshot ?? pay?.snapshot ?? {}) as Snapshot;
  const business=snap.business ?? {name:"VAG Engineering",logo:"/brand.jpg"};
  const name=snap.party?.name ?? snap.employee?.name ?? account?.party.name;
  const title=doc?label(lang,doc.kind):pay?label(lang,pay.kind):tr("Party statement");
  const at=doc?.at ?? pay?.at;
  const format=(input:Date)=>day(lang,input,business.dateFormat ?? "medium");
  const amt=(amount:string|bigint)=>money(lang,amount);
  const url="/print/"+type+"/"+id;
  const reverse=doc?.status==="reversed"||Boolean(pay?.reversedAt);
  const receipt=pay?await receiptDetails(pay):null;
  return <main className="doc-screen">
    <div className="print-actions">
      <Link className="button secondary" href={type==="statement"?"/balances?party="+id:"/"+type+"/"+id}>{tr("Back")}</Link>
      <Link href={url+"?lang=en"} className={"button "+(lang==="en"?"primary":"secondary")}>English</Link>
      <Link href={url+"?lang=ar"} className={"button "+(lang==="ar"?"primary":"secondary")}>مصري</Link>
      <PrintButton text={tr("Print A4")}/>
    </div>
    <article className="print-sheet" dir={lang==="ar"?"rtl":"ltr"} lang={lang==="ar"?"ar-EG":"en"}>
      <header className="print-head"><div><h2>{business.name}</h2>{business.address&&<p><bdi>{business.address}</bdi></p>}{business.phone&&<p><bdi>{business.phone}</bdi></p>}</div>
        <Image src={business.logo ?? "/brand.jpg"} alt={business.name} width={60} height={60} unoptimized/></header>
      <div className="print-info"><h1>{title}</h1>
        {(doc||pay)&&<p>{tr("Number")} <bdi>{doc?.number ?? pay?.number}</bdi></p>}
        {at&&<p>{tr("Date")} <bdi>{format(at)}</bdi></p>}
        {reverse&&<p>{label(lang,"reversed")}</p>}
        {name&&<p>{tr("Name")} <bdi>{name}</bdi></p>}
        {(snap.party?.phone||snap.employee?.phone||account?.party.phone)&&<p>{tr("Phone")} <bdi>{snap.party?.phone ?? snap.employee?.phone ?? account?.party.phone}</bdi></p>}
        {snap.party?.address&&<p>{tr("Address")} <bdi>{snap.party.address}</bdi></p>}
        {snap.vehicle&&!receipt?.bills.length&&<p>{tr("Vehicle")} <bdi>{[snap.vehicle.make,snap.vehicle.model,snap.vehicle.plate].filter(Boolean).join(" · ")}</bdi></p>}
        {doc?.dueAt&&<p>{tr("Due date")} <bdi>{format(doc.dueAt)}</bdi></p>}
      </div>
      {doc&&<>
        <BillItems lang={lang} bill={doc}/>
        {doc.payroll.length>0&&<Grid lang={lang} headers={["Date","Type","Amount","Notes"]} rows={doc.payroll.map((row)=>[format(row.at),label(lang,row.kind),amt(row.amount),row.note])}/>}
        {doc.allocations.length>0&&<Grid lang={lang} headers={["Number","Date","Type","Amount","Status"]} rows={doc.allocations.map((row)=>[
          row.payment.number,format(row.payment.at),label(lang,row.payment.kind),amt(row.amount),label(lang,row.releasedAt||row.payment.reversedAt?"reversed":"posted"),
        ])}/>}
        <p><strong>{tr("Total")}</strong> <bdi>{amt(doc.total)}</bdi></p>
        {doc.due!=null&&<p><strong>{tr("Amount due")}</strong> <bdi>{amt(doc.due)}</bdi></p>}
        {doc.note&&<p><bdi>{doc.note}</bdi></p>}
      </>}
      {pay&&<>
        <p>{tr("Payment method")} <bdi>{label(lang,pay.method)}</bdi></p>
        <p>{tr("Account")} <bdi>{pay.movements.filter((row)=>!row.reversal).map((row)=>row.account.name).join(" · ")}</bdi></p>
        <p><strong>{tr(pay.kind==="receipt"?"Payment amount":"Amount")}</strong> <bdi>{amt(pay.amount)}</bdi></p>
        {receipt&&<ReceiptItems lang={lang} details={receipt} print/>}
        {!receipt?.bills.length&&pay.allocations.length>0&&<Grid lang={lang} headers={["Document","Amount","Status"]} rows={pay.allocations.map((row)=>[
          row.document.number,amt(row.amount),label(lang,row.releasedAt||pay.reversedAt?"reversed":"posted"),
        ])}/>}
        {pay.note&&<p><bdi>{pay.note}</bdi></p>}
      </>}
      {account&&<Grid lang={lang} headers={["Date","Number","Type","Amount","Running balance"]} rows={account.rows.map((row)=>[
        format(row.at),row.number,label(lang,row.kind),amt(row.amount),amt(row.balance),
      ])}/>}
      {business.footer&&<footer className="print-footer"><bdi>{business.footer}</bdi></footer>}
    </article>
  </main>;
}

