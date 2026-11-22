import { Prisma, type DocumentKind } from "@prisma/client";
import { type Tx, json } from "./db";
import { cents, choice, date, extended, list, needed, requireRule, text, units } from "./rules";
import { number, type Actor } from "./transaction";

export const lineKinds = ["labor","service","part","supplied"] as const;
export type LineData = {
  kind: typeof lineKinds[number]; description:string; partId:string|null; sourceId?:string;
  quantity:Prisma.Decimal; price:bigint; discount:bigint; total:bigint; costTotal?:bigint; stockQty?:Prisma.Decimal; position:number;
};
export async function lines(tx: Tx, input: unknown, { onlyParts = false, issuedPartIds = [] }: {
  onlyParts?: boolean; issuedPartIds?: string[];
} = {}): Promise<LineData[]> {
  const rows = list(input ?? []);
  requireRule(rows.length > 0, "needLines");
  const ids = [...new Set(rows.flatMap((row) => row.kind === "part" ? [needed(row.partId)] : []))];
  const parts = await tx.part.findMany({where:{id:{in:ids},OR:[{archived:false},{id:{in:issuedPartIds}}]}});
  return rows.map((row,position) => {
    const kind = choice(row.kind,lineKinds);
    requireRule(!onlyParts || kind === "part");
    const part = kind === "part" ? parts.find((part) => part.id === row.partId) : null;
    requireRule(kind !== "part" || part, "missingPart");
    const quantity = units(row.quantity);
    const price = cents(row.price);
    const discount = cents(row.discount);
    const total = extended(quantity, price) - discount;
    requireRule(total >= 0n, "discountTooHigh");
    return {kind,description:needed(row.description || part?.name,500),partId:part?.id ?? null,quantity,price,discount,total,position};
  });
}
export async function snapshot(tx: Tx, partyId?: string | null, vehicleId?: string | null, employeeId?: string | null) {
  const [business,party,vehicle,employee] = await Promise.all([
    tx.setting.findUnique({where:{key:"business"}}),
    partyId ? tx.party.findUnique({where:{id:partyId},select:{name:true,phone:true,address:true}}) : null,
    vehicleId ? tx.vehicle.findUnique({where:{id:vehicleId},select:{make:true,model:true,color:true,plate:true,vin:true}}) : null,
    employeeId ? tx.employee.findUnique({where:{id:employeeId},select:{name:true,phone:true,rate:true,arrangement:true}}) : null,
  ]);
  return json({business:business?.value ?? {name:"VAG Engineering",logo:"/brand.jpg"},party,vehicle,employee});
}
export async function document(tx: Tx, actor: Actor, kind: Exclude<DocumentKind, "quote">, data: Omit<Prisma.DocumentUncheckedCreateInput, "kind"|"number"|"createdBy">, rows?: LineData[]) {
  return tx.document.create({data:{...data,kind,number:await number(tx,kind),createdBy:actor.id,
    ...(rows ? {total:rows.reduce((total,row)=>total+row.total,0n),lines:{create:rows}} : {})},include:{lines:true}});
}
export async function validParty(tx: Tx, input: unknown, kind: "customer"|"supplier") {
  const id = needed(input);
  requireRule(await tx.party.findFirst({where:{id,kind,archived:false}}),"partyMismatch");
  return id;
}
export async function validVehicle(tx: Tx, input: unknown, partyId: string, historical = false) {
  const id = needed(input);
  const vehicle = await tx.vehicle.findUnique({where:{id}});
  requireRule(vehicle && (historical || vehicle.partyId === partyId && !vehicle.archived),"vehicleMismatch");
  return vehicle;
}
export function documentDates(input: Record<string,unknown>) {
  const at = date(input.at);
  const dueAt = input.dueAt ? date(input.dueAt) : null;
  requireRule(!dueAt || dueAt >= at,"invalidDate");
  return {at,dueAt};
}

