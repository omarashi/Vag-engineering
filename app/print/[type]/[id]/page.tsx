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
import { can } from "@/lib/permissions";

type Snapshot={business?:{name:string;phone?:string;address?:string;footer?:string;logo?:string;dateFormat?:"short"|"medium"|"long"};
  party?:{name:string;phone?:string;address?:string};employee?:{name:string;phone?:string};vehicle?:{plate?:string;make?:string;model?:string}};
export default async function Page({params,searchParams}:{params:Promise<{type:string;id:string}>;searchParams:Promise<{lang?:string}>}){
  const [{type,id},query,request]=await Promise.all([params,searchParams,headers()]);
  const actor=await currentUser(request);
  if(!actor)redirect("/login");
  if(!can(actor.role,"payment"))notFound();
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
  const receipt=pay?.kind==="receipt"?await receiptDetails(pay):null;
  const receiptLogo=business.logo && business.logo!=="/brand.jpg" ? business.logo : "/receipt-logo.png";
  const businessDetails=(!receipt||business.address||business.phone)&&<div>
    {!receipt&&<h2>{business.name}</h2>}
    {business.address&&<p><bdi>{business.address}</bdi></p>}
    {business.phone&&<p><bdi>{business.phone}</bdi></p>}
  </div>;
  const reference=<>
    <h1>{title}</h1>
    {(doc||pay)&&<p>{tr("Number")} <bdi>{doc?.number ?? pay?.number}</bdi></p>}
    {at&&<p>{tr("Date")} <bdi>{format(at)}</bdi></p>}
    {reverse&&<p>{label(lang,"reversed")}</p>}
  </>;
  return <main className="doc-screen">
    <div className="print-actions">
      <Link className="button secondary" href={type==="statement"?"/balances?party="+id:"/"+type+"/"+id}>{tr("Back")}</Link>
      <Link href={url+"?lang=en"} className={"button "+(lang==="en"?"primary":"secondary")}>English</Link>
      <Link href={url+"?lang=ar"} className={"button "+(lang==="ar"?"primary":"secondary")}>مصري</Link>
      <PrintButton text={tr("Print A4")}/>
    </div>
    <article className={receipt?"print-sheet receipt-print":"print-sheet"} dir={lang==="ar"?"rtl":"ltr"} lang={lang==="ar"?"ar-EG":"en"}>
      <header className="print-head">
        {receipt ? <>
          <div className="receipt-print-identity">
            <Image className={"receipt-print-logo"+(receiptLogo==="/receipt-logo.png"?" receipt-print-default-logo":"")} src={receiptLogo} alt={business.name}
              width={610} height={409} loading="eager" unoptimized/>
            {businessDetails}
          </div>
          <div className="receipt-print-reference">{reference}</div>
        </> : <>
          {businessDetails}
          <Image src={business.logo ?? "/brand.jpg"} alt={business.name} width={60} height={60} unoptimized/>
        </>}
      </header>
      <div className="print-info">
        {!receipt&&reference}
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
        <p><strong>{tr(doc.kind==="invoice"?"Invoice total":"Total")}</strong> <bdi>{amt(doc.total)}</bdi></p>
        {doc.settlement&&<p><strong>{tr("Payments received")}</strong> <bdi>{amt(doc.settlement.received)}</bdi></p>}
        {doc.settlement&&BigInt(doc.settlement.credited)>0n&&<p><strong>{tr("Credits issued")}</strong> <bdi>{amt(doc.settlement.credited)}</bdi></p>}
        {doc.due!=null&&<p><strong>{tr("Amount due")}</strong> <bdi>{amt(doc.due)}</bdi></p>}
        {doc.note&&<p><bdi>{doc.note}</bdi></p>}
      </>}
      {pay&&<>
        <p>{tr("Payment method")} <bdi>{label(lang,pay.method)}</bdi></p>
        <p>{tr("Account")} <bdi>{pay.movements.filter((row)=>!row.reversal).map((row)=>row.account.name).join(" · ")}</bdi></p>
        {!receipt&&<p><strong>{tr("Amount")}</strong> <bdi>{amt(pay.amount)}</bdi></p>}
        {receipt&&<ReceiptItems lang={lang} details={receipt} print/>}
        {!receipt?.bills.length&&pay.allocations.length>0&&<Grid lang={lang} headers={["Document","Amount","Status"]} rows={pay.allocations.map((row)=>[
          row.document.number,amt(row.amount),label(lang,row.releasedAt||pay.reversedAt?"reversed":"posted"),
        ])}/>}
        {pay.note&&<p><bdi>{pay.note}</bdi></p>}
      </>}
      {account&&<Grid lang={lang} headers={["Date","Number","Type","Amount","Running balance"]} rows={account.rows.map((row)=>[
        format(row.at),row.number,label(lang,row.kind),amt(row.amount),amt(row.balance),
      ])}/>}
      {(receipt||business.footer)&&<footer className="print-footer">
        {business.footer&&(!receipt||business.footer!==business.name)&&<bdi>{business.footer}</bdi>}
        {receipt&&<p className="receipt-print-brand"><strong>{business.name}</strong></p>}
      </footer>}
    </article>
  </main>;
}

