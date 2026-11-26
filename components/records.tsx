import { notFound, redirect } from "next/navigation";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { db, plain } from "@/lib/db";
import { carName } from "@/lib/car-name";
import { documentDetail, documents, partCategories, parts, payments } from "@/lib/views";
import { ActionForm } from "./backoffice-form";
import { Actions, Amt, CashAccountSetup, DocRegister, Heading, Info, PayRegister, PrintLink, Ref, Register } from "./register";
import { Badge, ButtonLink, Panel } from "./ui";
import { Attachments } from "./attachments";
import { WorkshopMedia } from "./workshop-media";
import { VisitServiceDescription, VisitWorkList } from "./visit-work-list";
import { isItemizedVisitInvoice, visitWork, workshopIntake } from "@/lib/visit-items";
import { receiptDetails } from "@/lib/receipt-details";
import { ReceiptItems } from "./receipt-items";
import { clock, day, label, partCodeLabel, translate } from "@/lib/locale";
import { invoiceReceiptForm, receiptAccounts } from "@/lib/visit-forms";
import { ActionForm as ReceiptForm } from "./action-form";
import type { ModuleProps } from "./modules";
import { isWorkshopRecord } from "@/lib/permissions";
import { payrollLocked } from "@/lib/payroll-rules";

type Props=ModuleProps&{id:string};
export async function RecordView({lang,forms,id}:Props){
  const row=await documentDetail(id);
  const finance=forms.can("payment");
  if(!row || row.kind==="appointment" || (!finance&&!isWorkshopRecord(row.kind)))notFound();
  if(row.kind==="visit" || row.kind==="job" && workshopIntake(row.metadata))redirect("/jobs/"+id);
  const tr=(key:string)=>translate(lang,key);
  const meta=row.metadata as Record<string,unknown>;
  const snap=row.snapshot as {party?:{name:string};vehicle?:{make:string;model:string;color?:string;plate:string};employee?:{name:string}};
  const car=snap.vehicle ?? row.vehicle;
  const posted=row.status==="posted";
  const work=row.kind==="job";
  const sourcePath=row.source?.kind==="visit"||row.source?.kind==="job"?"/jobs/":"/record/";
  const billedWork=row.kind==="invoice"?visitWork(row):[];
  const itemizedVisit=row.kind==="invoice"&&isItemizedVisitInvoice(row.metadata);
  const payable=["invoice","purchase","customerOpening","supplierOpening","credit","supplierCredit","expense","payroll","employeeOpening"].includes(row.kind);
  const creditable=["invoice","purchase","customerOpening","supplierOpening"].includes(row.kind);
  const reversible=creditable||["credit","supplierCredit","expense","employeeOpening","advanceOpening"].includes(row.kind);
  const due=BigInt(row.due ?? 0);
  const locked=payrollLocked(row);
  const receiptTargets=row.kind==="invoice"&&posted&&due>0n&&forms.can("payment") ? await receiptAccounts() : null;
  const canEditAttachments=work?forms.can("job"):forms.can("expense");
  const links=row.related.filter((item)=>finance||isWorkshopRecord(item.kind)).map((item)=>[
    <Ref href={"/record/"+item.id}>{item.number}</Ref>,label(lang,item.kind),<Badge lang={lang} value={item.status}/>]);
  const invoice=row.related.find((item)=>item.kind==="invoice"&&item.status==="posted");
  const staffText=row.assignments.map((item)=>item.employee.name+(item.completed?" ✓":"")).join(", ");
  const creditsIssued=BigInt(row.settlement?.credited ?? 0);
  const partiallyPaid=due<BigInt(row.total);
  const payStatus=due===0n ? creditsIssued>0n?"settled":"paid" : partiallyPaid?"partial":"unpaid";
  return <><Heading lang={lang} title={row.number} description={label(lang,row.kind)+(row.title?" · "+row.title:"")}>
    <Badge lang={lang} value={row.status}/>{finance&&<PrintLink lang={lang} type="record" id={id}/>}
    {receiptTargets && (receiptTargets.length
      ? <ReceiptForm lang={lang} spec={invoiceReceiptForm(lang,row,due,receiptTargets)} primary/>
      : <CashAccountSetup lang={lang} canManage={forms.can("account")} primary/>)}
    {finance&&work&&invoice&&<ButtonLink href={"/record/"+invoice.id}>{tr("View invoice")}</ButtonLink>}
    <Actions lang={lang} forms={forms} primary={!receiptTargets} specs={[
      work&&row.status!=="cancelled"&&forms.jobUpdate(row),work&&row.status!=="cancelled"&&forms.assign(row),
      work&&!["delivered","cancelled"].includes(row.status)&&!invoice&&forms.jobStock(row),
      work&&row.status!=="cancelled"&&!invoice&&forms.invoice(row),
      work&&row.status!=="cancelled"&&!invoice&&forms.payment(undefined,row),
      row.kind==="purchaseOrder"&&row.status==="draft"&&forms.purchase("purchase",row),
      payable&&!locked&&row.kind!=="invoice"&&posted&&due>0n&&forms.payment(row),
      creditable&&posted&&forms.credit(row),
      reversible&&posted&&forms.reverse(row),
      row.kind==="payroll"&&!locked&&forms.payEntry(row),
      row.kind==="payroll"&&!locked&&due===0n&&forms.payFinalize(row),
      locked&&forms.payReopen(row),
    ]}/>
  </Heading><div className="detail-stack">
    {locked&&due>0n&&<p className="notice">{tr("A finalized period with a balance needs Owner review.")}</p>}
    <Info lang={lang} items={[
      ["Date",day(lang,row.at)],["Due date",finance&&row.dueAt?day(lang,row.dueAt):null],
      ["Customer",row.party&&row.party.kind==="customer"?<Ref href={"/customers/"+row.party.id}>{snap.party?.name ?? row.party.name}</Ref>:null],
      ["Supplier",finance&&row.party?.kind==="supplier"?<Ref href={"/purchasing/"+row.party.id}>{snap.party?.name ?? row.party.name}</Ref>:null],
      ["Vehicle",row.vehicle&&car?<Ref href={"/vehicles/"+row.vehicle.id}>{[carName(car),car.plate].filter(Boolean).join(" · ")}</Ref>:null],
      ["Employee",finance&&row.employee?<Ref href={"/payroll/"+row.employee.id}>{snap.employee?.name ?? row.employee.name}</Ref>:null],
      ["Technicians",staffText],[row.kind==="purchase"?"Supplier invoice number":"Reference",row.reference],
      ["Related documents",row.source&&(finance||isWorkshopRecord(row.source.kind))?<Ref href={sourcePath+row.source.id}>{row.source.number}</Ref>:null],
      ["Category",row.category],["Notes",row.note],
      [row.kind==="invoice"?"Invoice total":"Total",finance&&!work?<Amt lang={lang} value={row.total}/>:null],
      ["Payments received",finance&&row.settlement?<Amt lang={lang} value={row.settlement.received}/>:null],
      ["Credits issued",finance&&creditsIssued>0n?<Amt lang={lang} value={creditsIssued}/>:null],
      ["Amount due",finance&&row.due!=null?<Amt lang={lang} value={row.due}/>:null],
      ["Payments",finance&&payable&&posted&&!["credit","supplierCredit"].includes(row.kind)?<Badge lang={lang} value={payStatus}/>:null],
      ["Status",row.kind==="payroll"?tr(locked?"Finalized":"Open"):null],
    ]}/>
    {work&&<Info lang={lang} title="Work notes" items={[
      ["Mileage",String(meta.mileage ?? "")],["Complaint / requested work",String(meta.requested ?? "")],["Inspection",String(meta.inspection ?? "")],["Work notes",String(meta.work ?? "")],
      ["ECU notes",String(meta.ecu ?? "")],["TCU notes",String(meta.tcu ?? "")],["Dyno before",String(meta.dynoBefore ?? "")],["Dyno after",String(meta.dynoAfter ?? "")],
      ["Follow-up date",String(meta.followUp ?? "")],["Follow-up mileage",String(meta.followMileage ?? "")],
    ]}/>}
    {!itemizedVisit&&billedWork.length>0&&<Panel title={tr("Work done")}><VisitWorkList lang={lang} work={billedWork}/></Panel>}
    {!!row.lines.length&&<Panel title={tr("Line items")}><Register lang={lang} head={[
      "Type","Description","Quantity",...(finance?[itemizedVisit?"Unit price":"Price","Discount","Total","Cost"]:[]),
    ]} rows={row.lines.map((line)=>{
      const item=itemizedVisit&&line.kind==="service"?billedWork[line.position]:undefined;
      return [label(lang,line.kind),item?<VisitServiceDescription lang={lang} work={item}/>:<bdi>{line.description}</bdi>,String(line.quantity),
        ...(finance?[<Amt lang={lang} value={line.price}/>,<Amt lang={lang} value={line.discount}/>,<Amt lang={lang} value={line.total}/>,<Amt lang={lang} value={line.costTotal}/>]:[])];
    })}/></Panel>}
    {!!links.length&&<Panel title={tr("Related documents")}><Register lang={lang} head={["Number","Type","Status"]} rows={links}/></Panel>}
    {!!row.jobStock.length&&<Panel title={tr("Stock")}><Register lang={lang} head={["Part","Quantity",...(finance?["Cost"]:[])]} rows={row.jobStock.map((line)=>[
      finance?<Ref href={"/inventory/"+line.partId}>{line.part.name}</Ref>:<bdi>{line.part.name}</bdi>,
      String(line.issued),...(finance?[<Amt lang={lang} value={line.issuedCost}/>]:[]),
    ])}/></Panel>}
    {!!row.movements.length&&<Panel title={tr("Stock movements")}><Register lang={lang} head={["Date","Part","Type","Quantity","Reason"]} rows={row.movements.map((line)=>[
      day(lang,line.at),finance?<Ref href={"/inventory/"+line.partId}>{line.part.name}</Ref>:<bdi>{line.part.name}</bdi>,
      label(lang,line.kind),String(line.quantity),<bdi>{line.reason}</bdi>,
    ])}/></Panel>}
    {finance&&!!row.payroll.length&&<Panel title={tr("Pay entries")}><Register lang={lang} head={["Date","Type","Amount","Notes","Reference","Code"]} rows={row.payroll.map((item)=>[
      day(lang,item.at),label(lang,item.kind),<Amt lang={lang} value={item.amount}/>,<bdi>{item.note}</bdi>,<bdi>{item.reference}</bdi>,<bdi>{item.id}</bdi>,
    ])}/></Panel>}
    {finance&&!!row.allocations.length&&<Panel title={tr(row.kind==="invoice"?"Receipts":"Allocations")}><Register lang={lang} head={["Number","Date","Type","Amount","Status","Action"]} rows={row.allocations.map((item)=>[
      <Ref href={"/payment/"+item.paymentId}>{item.payment.number}</Ref>,day(lang,item.payment.at),label(lang,item.payment.kind),<Amt lang={lang} value={item.amount}/>,
      <Badge lang={lang} value={item.releasedAt||item.payment.reversedAt?"reversed":"posted"}/>,
      !locked&&!item.releasedAt&&!item.payment.reversedAt&&forms.can("unallocate")&&["receipt","supplierPayment","advance"].includes(item.payment.kind)?<ActionForm lang={lang} spec={forms.unallocate(item.id)}/>:null,
    ])}/></Panel>}
    {work ? <WorkshopMedia lang={lang} id={id} files={row.attachments} allowPhotos={row.status !== "cancelled"}
      allowAttachments={canEditAttachments} showAttachments/> :
      <Attachments lang={lang} type="document" id={id} allow={canEditAttachments} files={row.attachments.map(({id,name})=>({id,name}))}/>}
  </div></>;
}
export async function PaymentView({lang,forms,id}:Props){
  const [row]=await payments({},id);
  if(!row)notFound();
  const tr=(key:string)=>translate(lang,key);
  const open=!row.reversedAt;
  const hasLockedAllocation=row.allocations.some(item=>!item.releasedAt&&payrollLocked(item.document));
  const receipt=await receiptDetails(row);
  const unallocated=BigInt(row.amount)-row.allocations.filter((item)=>!item.releasedAt).reduce((sum,item)=>sum+BigInt(item.amount),0n);
  const allocations=row.allocations.length>0&&<Register lang={lang} head={["Document","Amount","Status","Action"]} rows={row.allocations.map((item)=>[
    <Ref href={"/record/"+item.documentId}>{item.document.number}</Ref>,<Amt lang={lang} value={item.amount}/>,<Badge lang={lang} value={item.releasedAt||!open?"reversed":"posted"}/>,
    open&&!item.releasedAt&&!payrollLocked(item.document)&&forms.can("unallocate")&&["receipt","supplierPayment","advance"].includes(row.kind)?<ActionForm lang={lang} spec={forms.unallocate(item.id)}/>:null,
  ])}/>;
  return <><Heading lang={lang} title={row.number} description={label(lang,row.kind)}><PrintLink lang={lang} type="payment" id={id} text={row.kind==="receipt"?"Print receipt":undefined}/>
    {row.kind==="receipt"&&row.partyId&&<ButtonLink href={"/customers/"+row.partyId+"#customer-balance"}>{tr("Customer balance")}</ButtonLink>}
    <Actions lang={lang} forms={forms} specs={[open&&unallocated>0n&&["receipt","supplierPayment","advance"].includes(row.kind)&&forms.allocate(row),open&&!hasLockedAllocation&&forms.reverse(row,true)]}/>
  </Heading><div className="detail-stack"><Info lang={lang} items={[
    ["Date",day(lang,row.at)],["Name",row.party?.name ?? row.employee?.name],["Amount",receipt?null:<Amt lang={lang} value={row.amount}/>],["Payment method",label(lang,row.method)],
    ["Status",<Badge lang={lang} value={open?"posted":"reversed"}/>],["Unapplied",["receipt","supplierPayment","advance"].includes(row.kind)&&open?<Amt lang={lang} value={unallocated}/>:null],
    ["Notes",row.note],["Reason",row.reverseReason],
  ]}/>
  {receipt&&<Panel title={tr("Receipt details")} className="receipt-details"><ReceiptItems lang={lang} details={receipt}/></Panel>}
  {!receipt&&<Panel title={tr("Money movements")}><Register lang={lang} head={["Date","Account","Amount","Status"]} rows={row.movements.map((item)=>[
    day(lang,item.at),item.account.name,<Amt lang={lang} value={item.amount}/>,<Badge lang={lang} value={item.reversal?"reversed":"posted"}/>,
  ])}/></Panel>}
  {allocations&&(receipt?.bills.length ? <details className="log-optional">
    <summary>{tr("Allocations")}<ChevronDown size={15} aria-hidden="true"/></summary>{allocations}
  </details> : <Panel title={tr("Allocations")}>{allocations}</Panel>)}</div></>;
}
export async function PartyView({lang,forms,id,kind}:Props&{kind:"customer"|"supplier"}){
  const row=await db.party.findFirst({where:{id,kind},include:{vehicles:true}});
  if(!row)notFound();
  const docs=await documents(kind==="customer"?["job","appointment","invoice","credit","customerOpening"]:["purchaseOrder","purchase","supplierCredit","supplierOpening"],{party:id});
  return <><Heading lang={lang} title={row.name} description={label(lang,kind)}><ButtonLink href={"/balances?party="+row.id}>{translate(lang,"Party statement")}</ButtonLink>
    <Actions lang={lang} forms={forms} specs={[forms.party(kind,row),kind==="customer"&&!row.archived&&forms.vehicle({},id)]}/>
  </Heading><div className="detail-stack"><Info lang={lang} items={[["Phone",row.phone],["Contact",row.contact],["Address",row.address],["Notes",row.note],["Status",translate(lang,row.archived?"Archived":"Open")]]}/>
  {kind==="customer"&&<Panel title={translate(lang,"Vehicles")}><Register lang={lang} head={["Vehicle","Plate","Tuning stage","Mileage"]} rows={row.vehicles.map((item)=>[
    <Ref href={"/vehicles/"+item.id}>{carName(item)}</Ref>,<bdi>{item.plate}</bdi>,item.stage,item.mileage,
  ])}/></Panel>}
  <Panel title={translate(lang,"Related documents")}><DocRegister lang={lang} docs={docs}/></Panel></div></>;
}
export async function VehicleView({lang,forms,id}:Props){
  const row=await db.vehicle.findUnique({where:{id},include:{party:true,history:{orderBy:{at:"desc"}},attachments:true}});
  if(!row)notFound();
  const docs=await documents(["job","invoice","credit","appointment"],{vehicle:id});
  const tr=(key:string)=>translate(lang,key);
  return <><Heading lang={lang} title="Vehicle history"><Actions lang={lang} forms={forms} specs={[forms.vehicle(row),{...forms.vehicleNote(row),hidden:{vehicleId:id}}]}/></Heading>
  <div className="detail-stack">
    <div className="vehicle-hero"><span className="hero-kicker"><i/>{tr("Vehicle")}</span><h2><bdi>{carName(row)}</bdi></h2><bdi>{row.plate}</bdi></div>
    <Info lang={lang} items={[
      ["Customer",<Ref href={"/customers/"+row.partyId}>{row.party.name}</Ref>],["Year",row.year],["Tuning stage",row.stage],["Mileage",row.mileage],
      ["VIN",row.vin],["Engine code",row.engine],["Transmission",row.transmission],["Notes",row.note],["Status",tr(row.archived?"Archived":"Open")],
    ]}/>
    <Panel title={tr("Related documents")}><DocRegister lang={lang} docs={docs}/></Panel>
    <Panel title={tr("History")}><Register lang={lang} head={["Date","Type","Details"]} rows={row.history.map((item)=>{
      const details=item.data as Record<string,unknown>;
      return [day(lang,item.at),label(lang,item.kind),<bdi>{String(details.note ?? details.name ?? details.stage ?? details.mileage ?? "")}{details.reason?" · "+String(details.reason):""}</bdi>];
    })}/></Panel><Attachments lang={lang} id={id} type="vehicle" allow={forms.can("vehicle")} files={row.attachments.map(({id,name})=>({id,name}))}/>
  </div></>;
}
export async function PartView({lang,forms,id}:Props){
  const [row]=await parts({},id);
  if(!row)notFound();
  const [movements,categories]=await Promise.all([
    db.stockMovement.findMany({where:{partId:id},include:{document:{select:{id:true,number:true}}},orderBy:{at:"desc"},take:100}),
    forms.can("part")?partCategories():[],
  ]);
  return <><Heading lang={lang} title={row.name} description={row.code}>
    {row.low&&<Badge lang={lang} value="Low stock"/>}
    <ButtonLink href="/inventory"><ChevronLeft size={15} className="rtl:rotate-180" aria-hidden="true"/>{translate(lang,"Back to inventory")}</ButtonLink>
    <Actions lang={lang} forms={forms} specs={[forms.part(row,categories),forms.stock(row)]}/>
  </Heading>
  <div className="detail-stack"><Info lang={lang} items={[
    [partCodeLabel(lang),row.code],["Category",row.category],["Brand",row.brand],["OEM number",row.oem],["Unit",row.unit],["Location",row.location],
    ["In stock",String(row.onHand)],["Minimum",String(row.minimum)],
    ["Cost",<Amt lang={lang} value={row.cost}/>],["Price",<Amt lang={lang} value={row.price}/>],["Notes",row.note],
  ]}/>
  <Panel title={translate(lang,"Stock movements")}><Register lang={lang} head={["Date","Type","Quantity","Cost","Document","Reason"]} rows={movements.map((item)=>[
    day(lang,item.at),label(lang,item.kind),String(item.quantity),<Amt lang={lang} value={item.totalCost}/>,
    item.document?<Ref href={"/record/"+item.document.id}>{item.document.number}</Ref>:null,<bdi>{item.reason}</bdi>,
  ])}/></Panel></div></>;
}

