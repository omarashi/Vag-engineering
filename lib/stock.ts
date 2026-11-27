import { Prisma, type MovementKind } from "@prisma/client";
import type { Tx } from "./db";
import { cents, choice, date, extended, needed, requireRule, text, units } from "./rules";
import type { Actor, Change } from "./transaction";
import { part, type Input } from "./masters";
import { workshopIntake } from "./visit-items";

const zero = new Prisma.Decimal(0);
const startingQuantityReason = "Starting quantity";

export async function startingQuantity(tx: Pick<Tx, "$queryRaw">, partId: string) {
  // Legacy Add Product entries used this reason without a separate stock-action audit.
  const [opening] = await tx.$queryRaw<{ quantity: Prisma.Decimal }[]>`
    SELECT COALESCE(SUM(m.quantity), 0) AS quantity
    FROM "StockMovement" m
    WHERE m."partId"=${partId} AND (m.kind='opening' OR
      (m.kind='adjustment' AND m.reason=${startingQuantityReason} AND NOT EXISTS (
        SELECT 1 FROM "Audit" a WHERE a.entity='stockMovement' AND a."entityId"=m.id AND a.action='stock'
      )))`;
  return opening.quantity;
}

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
export async function savePart(tx: Tx, input: Input, actor: Actor): Promise<Change> {
  if (input.initialQuantity === undefined) return part(tx, input);
  const id = text(input.id, 120);
  const quantity = units(text(input.initialQuantity, 20) || (id ? "" : "0"), true);
  requireRule(quantity.gte(0), "invalidStartingQuantity");
  const saved = await part(tx, input);
  const difference = id ? quantity.minus(await startingQuantity(tx, id)) : quantity;
  if (difference.isZero()) return saved;

  requireRule(input.archived !== true, "archiveStock");
  const { after } = await move(tx, actor, { partId: saved.id, kind: id ? "opening" : "adjustment", quantity: difference,
    reason: id ? "Starting quantity correction" : startingQuantityReason });
  return { ...saved, after };
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

