import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { json, type Tx } from "./db";
import { cents, choice, date, integer, moneyAccountKinds, needed, normalize, record, requireRule, text, today, units, RuleError } from "./rules";
import { prefixes, type Actor, type Change } from "./transaction";
import { workshopPhotosEnabled } from "./workshop-photos";
import { can } from "./permissions";
import { internalLoginEmail, normalizeUsername, validUsername } from "./usernames";
import { defaultEmployeeStart } from "./payroll-rules";

export type Input = Record<string, unknown>;
export function checkVersion(before: {version: number} | null, input: Input) {
  if (input.id) requireRule(before && before.version === integer(input.version, 0, 99999999), "stale", 409);
}
export async function party(tx: Tx, kind: "customer" | "supplier", input: Input): Promise<Change> {
  const id = text(input.id, 120);
  const before = id ? await tx.party.findUnique({ where: { id } }) : null;
  checkVersion(before, input);
  requireRule(!before || before.kind === kind);
  const data = {
    kind, name: needed(input.name), phone: text(input.phone, 80), contact: text(input.contact, 240),
    address: text(input.address, 600), note: text(input.note), archived: input.archived === true,
  };
  const duplicate = await tx.party.findFirst({where:{kind, id:{not:id}, archived:false,
    OR:[{name:{equals:data.name,mode:"insensitive"}}, ...(data.phone ? [{phone:data.phone}] : [])]}});
  if (kind === "supplier" && duplicate && !data.archived) {
    requireRule(before && !before.archived && before.name === data.name && before.phone === data.phone, "duplicateSupplier", 409);
  }
  const after = id
    ? await tx.party.update({ where: { id }, data:{...data, version:{increment:1}} })
    : await tx.party.create({ data });
  return { id:after.id, entity:"party", before, after, warning: duplicate ? "duplicateParty" : undefined };
}
export async function vehicle(tx: Tx, input: Input, actor: Actor): Promise<Change> {
  const id = text(input.id, 120);
  const before = id ? await tx.vehicle.findUnique({where:{id}}) : null;
  checkVersion(before, input);
  const partyId = needed(input.partyId);
  const owner = await tx.party.findFirst({where:{id:partyId,kind:"customer",archived:false}});
  requireRule(owner || before?.partyId === partyId, "partyMismatch");
  if (before && before.partyId !== partyId) needed(input.reason, 800);
  const vin = normalize(text(input.vin, 32)).toUpperCase() || null;
  requireRule(!vin || /^[A-HJ-NPR-Z0-9]{17}$/.test(vin), "invalidVin");
  const mileage = input.mileage === "" || input.mileage == null ? null : integer(input.mileage, 0, 9999999);
  const highest = before ? await tx.vehicleEvent.findFirst({where:{vehicleId:before.id,kind:"mileage"},orderBy:{at:"desc"}}) : null;
  const lastMileage = (highest?.data as {mileage?:number} | undefined)?.mileage ?? before?.mileage;
  if (mileage !== null && lastMileage != null && mileage < lastMileage && !text(input.reason)) {
    throw new RuleError("lowerMileage");
  }
  const data = { partyId, plate: text(input.plate, 32), model: needed(input.model), make: text(input.make,100),
    color: input.color === undefined ? before?.color ?? "" : text(input.color, 80),
    year: input.year ? integer(input.year, 1900, new Date().getFullYear() + 2) : null, stage: text(input.stage,100),
    mileage, vin, engine: text(input.engine,100), transmission: text(input.transmission,100), note:text(input.note),
    archived: input.archived === true,
  };
  const after = id ? await tx.vehicle.update({where:{id},data:{...data,version:{increment:1}}}) : await tx.vehicle.create({data});
  const add = (kind: string, data: unknown) => tx.vehicleEvent.create({data:{vehicleId:after.id,kind,actorId:actor.id,data:json(data)}});
  if (!before || before.partyId !== partyId) await add("ownership", { previous:before?.partyId, partyId, name:owner?.name, reason:text(input.reason) });
  if (mileage !== null && mileage !== before?.mileage) await add("mileage", { mileage, reason:text(input.reason) });
  if (data.stage !== (before?.stage ?? "")) await add("stage", { previous:before?.stage, stage:data.stage });
  return {id:after.id,before,after};
}
export async function vehicleNote(tx: Tx, input: Input, actor: Actor): Promise<Change> {
  const vehicleId = needed(input.vehicleId);
  const after = await tx.vehicleEvent.create({data:{vehicleId,actorId:actor.id,
    kind:choice(input.kind,["modification","maintenance","tuning"] as const),at:date(input.at),
    data:json({note:needed(input.note,4000)})}});
  return {id:after.id,entity:"vehicleEvent",after};
}
export async function part(tx: Tx, input: Input): Promise<Change> {
  const id = text(input.id,120);
  const before = id ? await tx.part.findUnique({where:{id}}) : null;
  checkVersion(before,input);
  const data = { name:needed(input.name),code:needed(input.code,50),category:text(input.category,100),oem:text(input.oem,100),
    brand:text(input.brand,100),unit:needed(input.unit || "pc",30),location:text(input.location,100),note:text(input.note),
    minimum:units(input.minimum || "0",true),price:cents(input.price),cost:cents(input.cost),archived:input.archived===true };
  requireRule(data.minimum.gte(0));
  requireRule(!data.archived || !before || before.onHand.isZero(), "archiveStock");
  if (before?.code !== data.code) {
    requireRule(!await tx.part.findUnique({ where: { code: data.code }, select: { id: true } }), "duplicatePartCode", 409);
  }
  const after = id ? await tx.part.update({where:{id},data:{...data,version:{increment:1}}}) : await tx.part.create({data});
  return {id:after.id,before,after};
}
export async function employee(tx: Tx, input: Input, actor: Actor): Promise<Change> {
  requireRule(can(actor.role,"employeeDismiss") || (input.endedAt === undefined && input.archived === undefined), "forbidden", 403);
  const id = text(input.id,120);
  const before = id ? await tx.employee.findUnique({where:{id}}) : null;
  checkVersion(before,input);
  const weeklySalary = input.weeklySalary === undefined ? before?.weeklySalary ?? null :
    text(input.weeklySalary) ? cents(input.weeklySalary) : null;
  const paidDaysPerWeek = input.paidDaysPerWeek === undefined ? undefined : integer(input.paidDaysPerWeek, 1, 7);
  const endedAt = before?.dismissalReason || input.endedAt === undefined ? before?.endedAt ?? null :
    input.endedAt ? date(input.endedAt) : null;
  const archived = before?.dismissalReason ? true : input.archived === undefined ? before?.archived ?? false : input.archived === true;
  const startedAt = input.startedAt ? date(input.startedAt) : before?.startedAt ?? date(defaultEmployeeStart());
  const data = { name:needed(input.name), phone:text(input.phone,80),
    arrangement:input.arrangement === undefined ? before?.arrangement ?? "" : text(input.arrangement,180),
    rate:input.rate === undefined ? before?.rate ?? 0n : cents(input.rate),
    effectiveAt:input.effectiveAt ? date(input.effectiveAt) : before?.effectiveAt ?? startedAt,startedAt,
    weeklySalary, paidDaysPerWeek, endedAt, note:text(input.note),archived };
  requireRule(!data.endedAt || today(data.endedAt) >= today(data.startedAt));
  const after = id ? await tx.employee.update({where:{id},data:{...data,version:{increment:1}}}) : await tx.employee.create({data});
  if ((data.rate !== 0n || (before?.rate ?? 0n) !== 0n) &&
      (!before || before.rate !== data.rate || before.arrangement !== data.arrangement || before.effectiveAt.getTime() !== data.effectiveAt.getTime())) {
    await tx.employeeRate.create({data:{employeeId:after.id,amount:data.rate,arrangement:data.arrangement,effectiveAt:data.effectiveAt,actorId:actor.id}});
  }
  return {id:after.id,before,after};
}
export async function account(tx: Tx,input: Input): Promise<Change> {
  const id=text(input.id,120);
  const before=id ? await tx.moneyAccount.findUnique({where:{id}}) : null;
  checkVersion(before,input);
  const code=input.code===undefined ? before?.code ?? null : text(input.code,16).toUpperCase() || null;
  const data={name:needed(input.name),code,kind:choice(input.kind,moneyAccountKinds),archived:input.archived===true};
  const after=id ? await tx.moneyAccount.update({where:{id},data:{...data,version:{increment:1}}}) : await tx.moneyAccount.create({data});
  return {id:after.id,before,after};
}
export async function catalogue(tx: Tx,input: Input): Promise<Change> {
  const id=text(input.id,120);
  const before=id ? await tx.catalog.findUnique({where:{id}}) : null;
  checkVersion(before,input);
  const data = {group:choice(input.group,["service","make","model","stage","expenseCategory","paymentMethod","location"] as const),
    name:needed(input.name),description:text(input.description),price:cents(input.price),archived:input.archived===true};
  const after=id ? await tx.catalog.update({where:{id},data:{...data,version:{increment:1}}}) : await tx.catalog.create({data});
  return {id:after.id,before,after};
}
export async function settings(tx: Tx,input: Input): Promise<Change> {
  const before = await tx.setting.findMany({where:{key:{in:["business","prefixes"]}}});
  const oldBusiness = before.find((row) => row.key === "business")?.value as {version?:number} | undefined;
  const version = oldBusiness?.version ?? 0;
  requireRule(integer(input.version ?? 0,0,99999999) === version,"stale",409);
  requireRule(input.workshopPhotos === undefined || typeof input.workshopPhotos === "boolean");
  const logo = text(input.logo,400);
  requireRule(!logo || /^\/[-\w./]+\.(jpg|jpeg|png|webp)$/i.test(logo) && !logo.startsWith("//") && !logo.includes(".."));
  const business = {name:needed(input.name),phone:text(input.phone,80),address:text(input.address,600),
    footer:text(input.footer),logo:logo || "/brand.jpg",dateFormat:choice(input.dateFormat || "medium",["short","medium","long"] as const),
    workshopPhotos:input.workshopPhotos ?? workshopPhotosEnabled(oldBusiness),version:version+1};
  const source = input.prefixes ? record(input.prefixes) : {};
  const custom = Object.fromEntries(Object.keys(prefixes).filter((key)=>source[key]).map((key) => {
    const value = needed(source[key],8).toUpperCase();
    requireRule(/^[A-Z][A-Z0-9]{1,7}$/.test(value));
    return [key,value];
  }));
  for (const [key,value] of Object.entries({business,prefixes:custom})) {
    await tx.setting.upsert({where:{key},create:{key,value},update:{value}});
  }
  return {id:"business",before,after:{business,prefixes:custom}};
}
export async function user(tx: Tx,input: Input): Promise<Change> {
  const id = text(input.id,120);
  const select = {id:true,name:true,username:true,role:true,active:true,updatedAt:true} as const;
  const before = id ? await tx.user.findUnique({where:{id},select}) : null;
  requireRule(!id || before && before.updatedAt.toISOString() === input.updatedAt, "stale",409);
  const username = typeof input.username === "string" ? normalizeUsername(input.username) : "";
  const role = choice(input.role,["owner","accountant","technician"] as const);
  const active = input.active !== false;
  const password = text(input.password,128);
  requireRule(validUsername(username), "invalidUsername");
  if (before?.username !== username) {
    requireRule(!await tx.user.findUnique({where:{username},select:{id:true}}), "duplicateUsername", 409);
  }
  requireRule((before && !password) || password.length >= 12,"passwordLength");
  if (before?.role === "owner" && before.active && (role !== "owner" || !active)) {
    requireRule(await tx.user.count({where:{role:"owner",active:true,id:{not:before.id}}}),"lastOwner");
  }
  const data = {name:needed(input.name),username,role,active};
  const userId = before?.id ?? randomUUID();
  const after = before
    ? await tx.user.update({where:{id:userId},data,select})
    : await tx.user.create({data:{id:userId,email:internalLoginEmail(userId),...data},select});
  if (password) {
    const passwordHash = await hashPassword(password);
    const account = await tx.account.findFirst({where:{userId:after.id,providerId:"credential"}});
    if (account) await tx.account.update({where:{id:account.id},data:{password:passwordHash}});
    else await tx.account.create({data:{id:randomUUID(),userId:after.id,accountId:after.id,providerId:"credential",password:passwordHash}});
  }
  if (before && (!active || password || before.role !== after.role || before.username !== after.username)) await tx.session.deleteMany({where:{userId:after.id}});
  return {id:after.id,before,after:{...after,passwordReset:Boolean(before && password)}};
}

