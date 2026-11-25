import { Prisma, type MovementKind } from "@prisma/client";
import type { Tx } from "./db";
import { cents, choice, date, extended, needed, requireRule, text, units } from "./rules";
import type { Actor, Change } from "./transaction";
import type { Input } from "./masters";
import { workshopIntake } from "./visit-items";

const zero = new Prisma.Decimal(0);
export async function move(tx: Tx, actor: Actor, params: {
  partId: string; kind: MovementKind; quantity?: Prisma.Decimal; reserve?: Prisma.Decimal;
  documentId?: string; at?: Date; reason?: string; unitCost?:bigint; totalCost?:bigint;
}) {
  const part = await tx.part.findUnique({where:{id:params.partId}});
  requireRule(part && (!part.archived || params.kind==="reversal"),"missingPart");
  const quantity = params.quantity ?? zero;
  const reserve = params.reserve ?? zero;
  const onHand = part.onHand.plus(quantity);
  const reserved = part.reserved.plus(reserve);
  requireRule(reserved.gte(0) && onHand.gte(reserved),"stockConflict",409);
  const unitCost = params.unitCost ?? part.cost;
  const totalCost = params.totalCost ?? extended(quantity.abs(),unitCost);
  const after = await tx.part.update({where:{id:part.id},data:{onHand,reserved,version:{increment:1}}});
  const movement = await tx.stockMovement.create({data:{
    partId:part.id,kind:params.kind,quantity,reserve,documentId:params.documentId,at:params.at,reason:params.reason,unitCost,totalCost,actorId:actor.id,
  }});
  return { before:part, after, movement };
}
export async function stock(tx: Tx, input: Input, actor: Actor): Promise<Change> {
  const partId=needed(input.partId);
  const type=choice(input.kind || "adjustment",["opening","adjustment","count"] as const);
  const current=await tx.part.findUnique({where:{id:partId}});
  requireRule(current,"missingPart");
  if (type==="count") requireRule(String(current.version)===String(input.version),"stale",409);
  if (type==="opening") {
    requireRule(!(await tx.setting.findUnique({where:{key:"openingFinal"}})),"openingLocked");
    requireRule(!(await tx.stockMovement.findFirst({where:{partId}})),"alreadyPosted",409);
  }
  const quantity=units(input.quantity,true);
  requireRule(type!=="opening" || quantity.gt(0));
  const reason=needed(input.reason,800);
  const cost=type==="opening" ? cents(input.cost) : current.cost;
  const result=await move(tx,actor,{partId,kind:type==="count"?"adjustment":type,quantity:type==="count"?quantity.minus(current.onHand):quantity,
    at:date(input.at),reason,unitCost:cost});
  const after=type==="opening" ? await tx.part.update({where:{id:partId},data:{cost}}) : result.after;
  return {id:result.movement.id,entity:"stockMovement",before:result.before,after:{part:after,movement:result.movement}};
}
export async function jobStock(tx: Tx, input: Input, actor: Actor): Promise<Change> {
  const documentId=needed(input.jobId);
  const job=await tx.document.findFirst({where:{id:documentId,kind:"job",status:{notIn:["cancelled","delivered"]}}});
  requireRule(job && !workshopIntake(job.metadata),"invalidJob");
  requireRule(!(await tx.document.findFirst({where:{kind:"invoice",sourceId:documentId,status:"posted"}})),"alreadyPosted",409);
  const partId=needed(input.partId);
  const kind=choice(input.kind,["issue","jobReturn"] as const);
  const amount=units(input.quantity);
  const match={documentId,partId};
  const previous=await tx.jobStock.findUnique({where:{documentId_partId:match}});
  const priorReserved=previous?.reserved ?? zero;
  const priorIssued=previous?.issued ?? zero;
  const priorCost=previous?.issuedCost ?? 0n;
  let reserve=zero;
  let quantity=zero;
  const reason=text(input.reason,800);
  if (kind==="issue") {
    const release=Prisma.Decimal.min(amount,priorReserved);
    reserve=release.negated();
    quantity=amount.negated();
  }
  let returnCost: bigint | undefined;
  if (kind==="jobReturn") {
    requireRule(priorIssued.gte(amount),"stockConflict",409);
    quantity=amount;
    returnCost = amount.eq(priorIssued) ? priorCost : BigInt(amount.mul(String(priorCost)).div(priorIssued).toDecimalPlaces(0,Prisma.Decimal.ROUND_HALF_UP).toFixed());
  }
  const {movement}=await move(tx,actor,{partId,kind,quantity,reserve,documentId,reason,totalCost:returnCost});
  const change={reserved:priorReserved.plus(reserve),issued:priorIssued.minus(quantity),
    issuedCost:priorCost+(kind==="issue"?movement.totalCost:kind==="jobReturn"?-movement.totalCost:0n)};
  const after=await tx.jobStock.upsert({where:{documentId_partId:match},create:{...match,...change},update:change});
  return {id:documentId,entity:"jobStock",before:previous,after:{stock:after,movement}};
}

