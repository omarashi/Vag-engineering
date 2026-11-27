import { randomUUID } from "node:crypto";
import { Prisma, type Document, type DocumentKind } from "@prisma/client";
import type { Tx } from "./db";
import { json } from "./db";
import { document, documentDates, lines, snapshot, validParty, validVehicle, type LineData } from "./documents";
import { amountDue, cents, choice, date, extended, needed, requireRule, text, today, unitAmount, units, list } from "./rules";
import { move } from "./stock";
import { part, party, type Input } from "./masters";
import { audit, type Actor, type Change } from "./transaction";
import { workshopIntake } from "./visit-items";
import { createSupplierPart, findSupplierQuote, linkedSupplierPart, supplierPriceList } from "./supplier-price-list";
import { billingMetadata, hasBillingInput, workshopBillingData, workshopBillingLines } from "./workshop-billing-lines";
import { workshopMetadata } from "./workshop-charges";

const zero = new Prisma.Decimal(0);
export async function allocated(tx:Tx, documentId:string) {
  return (await tx.allocation.aggregate({where:{documentId,releasedAt:null,payment:{reversedAt:null}},_sum:{amount:true}}))._sum.amount ?? 0n;
}
export async function credits(tx:Tx,sourceId:string){
  return (await tx.document.aggregate({where:{sourceId,kind:{in:["credit","supplierCredit"]},status:"posted"},_sum:{total:true}}))._sum.total ?? 0n;
}
export async function appliedCredit(tx:Tx, invoiceId:string) {
  return (await tx.customerCreditUse.aggregate({where:{invoiceId,reversedAt:null},_sum:{amount:true}}))._sum.amount ?? 0n;
}
export async function usedCredit(tx:Tx, source:{creditId:string}|{receiptId:string}) {
  return (await tx.customerCreditUse.aggregate({where:{...source,reversedAt:null},_sum:{amount:true}}))._sum.amount ?? 0n;
}
export function documentAmountDue(total:bigint, settled:bigint, credited:bigint) {
  const remaining = amountDue(total, settled, credited);
  return remaining > 0n ? remaining : 0n;
}
export async function creditEntitlement(tx:Tx, row:Document){
    requireRule(row.kind==="credit" || row.kind==="supplierCredit", "invalidDocument");
    const other=await tx.document.findUniqueOrThrow({where:{id:row.sourceId ?? ""}});
    const prior=await tx.document.findMany({where:{sourceId:other.id,kind:row.kind,status:"posted"},orderBy:[{createdAt:"asc"},{number:"asc"}]});
    const headroom=other.total-await allocated(tx,other.id)-await appliedCredit(tx,other.id);
    let cumulative=0n;
    for(const entry of prior){
      const before=cumulative;
      cumulative+=entry.total;
      if(entry.id===row.id) {
        const credit = cumulative>headroom ? cumulative-headroom : 0n;
        const previous = before>headroom ? before-headroom : 0n;
        return credit-previous;
      }
    }
    return 0n;
}
export async function due(tx:Tx, row:Document){
  const settled=await allocated(tx,row.id);
  if (row.kind==="credit" || row.kind==="supplierCredit"){
    return await creditEntitlement(tx,row)-settled-(row.kind==="credit"?await usedCredit(tx,{creditId:row.id}):0n);
  }
  return documentAmountDue(row.total, settled+await appliedCredit(tx,row.id), await credits(tx,row.id));
}
export async function protectSettledCredits(tx:Tx, sourceId:string) {
  const notes=await tx.document.findMany({where:{sourceId,status:"posted",kind:{in:["credit","supplierCredit"]}}});
  for(const note of notes) requireRule(await due(tx,note)>=0n,"refundFirst");
}
export async function purchaseOrder(tx:Tx,input:Input,actor:Actor):Promise<Change>{
  const partyId=await validParty(tx,input.partyId,"supplier");
  const after=await document(tx,actor,"purchaseOrder",{...documentDates(input),status:"draft",partyId,note:text(input.note),
    snapshot:await snapshot(tx,partyId)},await lines(tx,input.lines,{onlyParts:true}));
  return {id:after.id,entity:"document",after};
}

async function purchaseLines(tx: Tx, input: unknown, actor: Actor) {
  const entries = list(input ?? []);
  const priceList = entries.some((row) => row.productSource === "quote") ? await supplierPriceList(tx) : null;
  const resolved: Input[] = [];
  for (const row of entries) {
    const source = choice(row.productSource ?? "inventory", ["inventory", "manual", "quote"] as const);
    requireRule(row.kind === "part");
    if (source === "inventory") {
      resolved.push(row);
      continue;
    }
    if (source === "manual") {
      requireRule(cents(row.sellingPrice) > 0n, "sellingPriceRequired");
      const created = await part(tx, {
        name: row.description, brand: row.brand, code: text(row.code, 50) || "PRT-" + randomUUID(),
        price: row.sellingPrice, cost: row.price,
      });
      await audit(tx, actor.id, "part", "part", created.id, null, created.after);
      resolved.push({ ...row, partId: created.id });
      continue;
    }
    const { list, quote } = findSupplierQuote(priceList, row);
    const existing = await linkedSupplierPart(tx, quote);
    let partId = existing?.id;
    if (!partId) {
      requireRule(cents(row.sellingPrice) > 0n, "sellingPriceRequired");
      const created = await createSupplierPart(tx, list, quote, row.sellingPrice);
      await audit(tx, actor.id, "part", "part", created.id, null, created.after);
      partId = created.id;
    }
    resolved.push({ ...row, description: quote.description, partId, price: row.price ?? quote.cost });
  }
  return lines(tx, resolved, { onlyParts: true });
}

export async function purchase(tx:Tx,input:Input,actor:Actor):Promise<Change>{
  const sourceId=text(input.sourceId,120) || undefined;
  const order=sourceId ? await tx.document.findFirst({where:{id:sourceId,kind:"purchaseOrder",status:"draft"},include:{lines:true}}) : null;
  requireRule(!sourceId || order,"alreadyPosted",409);
  const partyId=await validParty(tx,order?.partyId ?? input.partyId,"supplier");
  const reference=text(input.reference,120);
  if (reference) {
    requireRule(!(await tx.document.findFirst({where:{partyId,kind:"purchase",status:"posted",reference:{equals:reference,mode:"insensitive"}}})),"duplicateReference",409);
  }
  const rows=order && !input.lines ? order.lines.map(({kind,description,partId,quantity,price,discount,total,position,id})=>({
    kind,description,partId,quantity,price,discount,total,position,sourceId:id})) :
    order ? await lines(tx,input.lines,{onlyParts:true}) : await purchaseLines(tx,input.lines,actor);
  const dates=documentDates(input);
  const after=await document(tx,actor,"purchase",{...dates,status:"posted",partyId,sourceId,reference,note:text(input.note),
    snapshot:await snapshot(tx,partyId)},rows);
  for(const row of rows){
    requireRule(row.partId);
    const unitCost=unitAmount(row.total,row.quantity);
    await move(tx,actor,{partId:row.partId,kind:"purchase",quantity:row.quantity,unitCost,totalCost:row.total,documentId:after.id,at:after.at});
    await tx.part.update({where:{id:row.partId},data:{cost:unitCost}});
  }
  if(order) await tx.document.update({where:{id:order.id},data:{status:"received",version:{increment:1}}});
  return {id:after.id,entity:"document",after};
}
async function counterCustomer(tx: Tx, input: Input, actor: Actor) {
  if (input.partyId || input.customerName === undefined) return validParty(tx, input.partyId, "customer");
  const name = needed(input.customerName);
  const matches = await tx.party.findMany({
    where: { kind: "customer", archived: false, name: { equals: name, mode: "insensitive" } },
    select: { id: true }, take: 2,
  });
  requireRule(matches.length <= 1, "chooseCounterCustomer");
  if (matches[0]) return matches[0].id;
  const created = await party(tx, "customer", { name });
  await audit(tx, actor.id, "customer", "party", created.id, null, created.after);
  return created.id;
}

export async function invoice(tx:Tx,input:Input,actor:Actor):Promise<Change>{
  const sourceId=text(input.jobId,120)||undefined;
  const job=sourceId ? await tx.document.findFirst({where:{id:sourceId,kind:"job",status:{not:"cancelled"}},include:{jobStock:true}}) : null;
  requireRule(!sourceId || job && !workshopIntake(job.metadata),"invalidJob");
  if(job) requireRule(!(await tx.document.findFirst({where:{sourceId,kind:"invoice",status:"posted"}})),"alreadyPosted",409);
  if(job && input.jobVersion!==undefined) requireRule(input.jobVersion===job.version,"stale",409);
  requireRule(job || !hasBillingInput(input), "invalidJob");
  const partyId=job ? job.partyId ?? await validParty(tx,input.partyId,"customer") : await counterCustomer(tx,input,actor);
  const vehicleId=job?.vehicleId ?? (input.vehicleId && input.customerName === undefined ? (await validVehicle(tx,input.vehicleId,partyId)).id : null);
  const rows = await lines(tx,input.lines,{
    onlyParts:!job,allowEmpty:Boolean(job),issuedPartIds:job?.jobStock.filter((item)=>item.issued.gt(0)).map((item)=>item.partId),
  });
  const byPart=new Map<string,{quantity:Prisma.Decimal;cost:bigint}>();
  if (job) {
    for (const item of job.jobStock) {
      byPart.set(item.partId,{quantity:item.issued,cost:item.issuedCost});
    }
    for (const row of rows.filter((entry)=>entry.partId)) {
      const item=byPart.get(row.partId ?? "");
      requireRule(item && item.quantity.gte(row.quantity),"issueBeforeInvoice");
      row.costTotal=row.quantity.eq(item.quantity) ? item.cost :
        BigInt(row.quantity.mul(String(item.cost)).div(item.quantity).toDecimalPlaces(0,Prisma.Decimal.ROUND_HALF_UP).toFixed());
      row.stockQty=row.quantity;
      item.quantity=item.quantity.minus(row.quantity);
      item.cost-=row.costTotal;
    }
    requireRule([...byPart.values()].every((item)=>item.quantity.isZero()),"reconcileJob");
  } else {
    for (const row of rows) {
      const part=await tx.part.findUniqueOrThrow({where:{id:row.partId ?? ""}});
      row.costTotal=extended(row.quantity,part.cost);
      row.stockQty=row.quantity;
    }
  }
  const dates=documentDates(input);
  if (job) {
    const billing = await workshopBillingData(tx, job.metadata, input);
    rows.push(...workshopBillingLines(billing, rows.length));
    if (hasBillingInput(input)) await tx.document.update({ where: { id: job.id }, data: {
      version: { increment: 1 }, metadata: json({ ...workshopMetadata(job.metadata), ...billingMetadata(billing) }),
    }});
  }
  requireRule(rows.length > 0, "needLines");
  const after=await document(tx,actor,"invoice",{...dates,status:"posted",sourceId,partyId,vehicleId,title:job?.title ?? "",
    note:text(input.note),snapshot:await snapshot(tx,partyId,vehicleId)},rows);
  if (!job) {
    for (const row of rows) {
      await move(tx,actor,{partId:row.partId ?? "",kind:"sale",quantity:row.quantity.negated(),documentId:after.id,at:after.at,totalCost:row.costTotal});
    }
  }
  return {id:after.id,entity:"document",after};
}
export async function credit(tx:Tx,input:Input,actor:Actor,batchId?:string):Promise<Change>{
  const sourceId=needed(input.sourceId);
  const original=await tx.document.findFirst({where:{id:sourceId,status:"posted",kind:{in:["invoice","purchase","customerOpening","supplierOpening"]}},include:{lines:true}});
  requireRule(original,"invalidDocument");
  const supplier=["purchase","supplierOpening"].includes(original.kind);
  const dates=documentDates(input);
  const kind=supplier ? "supplierCredit" : "credit";
  const note=needed(input.reason,2000);
  requireRule(batchId?today(dates.at)>=today(original.at):dates.at>=original.at,"invalidDate");
  if(batchId) requireRule(original.kind==="invoice", "invalidDocument");
  const prior=await tx.document.findMany({where:{sourceId,kind,status:"posted"},include:{lines:true}});
  const priorTotal=prior.reduce((sum,row)=>sum+row.total,0n);
  const fully=Boolean(batchId && input.full===true);
  if(fully) requireRule(input.lines===undefined && input.amount===undefined, "invalid");
  const fullyItemized=fully && original.lines.length>0 && prior.every((entry)=>entry.lines.length>0);
  const priorLines=prior.flatMap((entry)=>entry.lines);
  const suppliedLines=fullyItemized ? original.lines.flatMap((line):Input[]=>{
    const priorReturns=priorLines.filter((row)=>row.sourceId===line.id);
    const available=line.total-priorReturns.reduce((sum,row)=>sum+row.total,0n);
    const quantity=line.quantity.minus(priorReturns.reduce((sum,row)=>sum.plus(row.quantity),zero));
    return available<=0n ? [] : [{sourceId:line.id,disposition:"none",
      ...(quantity.gt(0) ? {quantity:quantity.toFixed()} : {amount:(available/100n).toString()+"."+(available%100n).toString().padStart(2,"0")})}];
  }) : list(input.lines ?? []);
  const rows:LineData[]=[];
  if (suppliedLines.length) {
    for(const entry of suppliedLines){
      const originalLine=original.lines.find((line)=>line.id===entry.sourceId);
      requireRule(originalLine && !rows.some((row)=>row.sourceId===entry.sourceId),"invalidDocument");
      const returned=priorLines.filter((line)=>line.sourceId===originalLine.id);
      const remainingValue=originalLine.total-returned.reduce((sum,line)=>sum+line.total,0n);
      const classification = { purpose: originalLine.purpose, supplierId: originalLine.supplierId, supplierName: originalLine.supplierName, buyingPrice: originalLine.buyingPrice };
      if (entry.amount !== undefined && entry.amount !== "") {
        const amount = cents(entry.amount);
        requireRule(original.kind === "invoice" && amount > 0n && amount <= remainingValue && entry.disposition === "none", "returnLimit");
        rows.push({ ...classification, kind: originalLine.kind, description: originalLine.description, partId: originalLine.partId,
          sourceId: originalLine.id, quantity: zero, price: amount, discount: 0n, total: amount, position: rows.length, returnDisposition:"none" });
        continue;
      }
      const quantity=units(entry.quantity);
      const remaining=originalLine.quantity.minus(returned.reduce((sum,line)=>sum.plus(line.quantity),zero));
      requireRule(quantity.lte(remaining),"returnLimit");
      const restock=entry.disposition==="restock";
      const remove=entry.disposition==="remove";
      const damaged=entry.disposition==="damaged";
      requireRule(entry.disposition==="none" || (!supplier && damaged && (originalLine.partId || originalLine.purpose==="importedItem")) ||
        (originalLine.partId && (supplier ? remove : restock)));
      if(restock) requireRule(quantity.lte(originalLine.stockQty.minus(returned.reduce((sum,line)=>sum.plus(line.stockQty),zero))),"returnLimit");
      const proportional=(total:bigint)=>BigInt(quantity.mul(String(total)).div(originalLine.quantity).toDecimalPlaces(0,Prisma.Decimal.ROUND_HALF_UP).toFixed());
      const proportionalValue = proportional(originalLine.total);
      const total=quantity.eq(remaining) || proportionalValue > remainingValue ? remainingValue : proportionalValue;
      const costTotal=quantity.eq(remaining) ? originalLine.costTotal-returned.reduce((sum,line)=>sum+line.costTotal,0n) : proportional(originalLine.costTotal);
      requireRule(total>=0n && costTotal>=0n,"returnLimit");
      rows.push({...classification,kind:originalLine.kind,description:originalLine.description,partId:originalLine.partId,sourceId:originalLine.id,
        quantity,price:originalLine.price,discount:extended(quantity,originalLine.price)-total,total,costTotal,
        stockQty:restock ? quantity : remove ? quantity.negated() : zero,position:rows.length,returnDisposition:String(entry.disposition)});
    }
  }
  const total=rows.length ? rows.reduce((sum,row)=>sum+row.total,0n) : fully ? original.total-priorTotal : cents(input.amount);
  requireRule(total>0n && total+priorTotal<=original.total,"returnLimit");
  if (!rows.length && !batchId) requireRule(total<=await due(tx,original),"amountMismatch");
  const after=await document(tx,actor,kind,{...dates,status:"posted",sourceId,refundBatchId:batchId,partyId:original.partyId,vehicleId:original.vehicleId,
    total,note,reference:original.number,snapshot:json(original.snapshot)},rows.length ? rows : undefined);
  for(const row of rows){
    if(row.partId && row.stockQty && !row.stockQty.isZero()){
      await move(tx,actor,{partId:row.partId,kind:supplier?"supplierReturn":"customerReturn",quantity:row.stockQty,
        documentId:after.id,at:after.at,reason:note,totalCost:supplier?row.total:row.costTotal});
    }
  }
  return {id:after.id,entity:"document",after};
}
export async function reverseDocument(tx:Tx,input:Input,actor:Actor):Promise<Change>{
  const id=needed(input.id);
  const kinds:DocumentKind[]=["invoice","purchase","credit","supplierCredit","expense","customerOpening","supplierOpening","employeeOpening","advanceOpening"];
  const before=await tx.document.findFirst({where:{id,status:"posted",kind:{in:kinds}},include:{movements:true}});
  requireRule(before,"invalidDocument");
  const reason=needed(input.reason,1000);
  requireRule(await allocated(tx,id)===0n && await credits(tx,id)===0n && await appliedCredit(tx,id)===0n,"unallocateFirst");
  if(before.kind==="advanceOpening") requireRule(!await tx.payEntry.findFirst({where:{reference:id,kind:"openingRecovery"}}),"unallocateFirst");
  if(before.kind==="credit" || before.kind==="supplierCredit"){
    const related=await tx.document.findMany({where:{sourceId:before.sourceId,kind:before.kind,status:"posted"}});
    for(const entry of related) requireRule(await allocated(tx,entry.id)===0n && await usedCredit(tx,{creditId:entry.id})===0n,"unallocateFirst");
  }
  const at=date(input.at);
  requireRule(at>=before.at,"invalidDate");
  for(const movement of before.movements){
    await move(tx,actor,{partId:movement.partId,kind:"reversal",quantity:movement.quantity.negated(),reserve:movement.reserve.negated(),
      unitCost:movement.unitCost,totalCost:movement.totalCost,documentId:id,at,reason});
    if (before.kind==="purchase") {
      const latest=await tx.stockMovement.findFirst({where:{partId:movement.partId,kind:{in:["purchase","opening"]},documentId:{not:id},
        OR:[{kind:"opening"},{document:{status:"posted"}}]},orderBy:{at:"desc"}});
      if(latest) await tx.part.update({where:{id:movement.partId},data:{cost:latest.unitCost}});
    }
  }
  if(before.kind==="purchase" && before.sourceId) await tx.document.update({where:{id:before.sourceId},data:{status:"draft",version:{increment:1}}});
  const after=await tx.document.update({where:{id},data:{status:"reversed",version:{increment:1},
    metadata:json({...before.metadata as object,reversedAt:at,reason,reversedBy:actor.id})}});
  return {id,entity:"document",before,after};
}

