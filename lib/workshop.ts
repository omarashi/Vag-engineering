import type { Tx } from "./db";
import { json } from "./db";
import { document, snapshot, validParty, validVehicle } from "./documents";
import { checkVersion, type Input } from "./masters";
import { choice, date, integer, needed, requireRule, text } from "./rules";
import { move } from "./stock";
import { workshopIntake, intakeStatuses } from "./visit-items";
import { jobEndDate } from "./visits";
import type { Actor, Change } from "./transaction";

export const jobStates=["new","inspecting","awaitingApproval","approved","inProgress","delivered","cancelled"] as const;
export const closedJobStatuses = ["delivered", "cancelled"];
export const openJobStatuses = jobStates.filter((status) => !closedJobStatuses.includes(status));
export const appointmentStates=["scheduled","arrived","completed","cancelled","noShow"] as const;

async function assignmentIds(tx:Tx,input:unknown) {
  if (!input) return [];
  requireRule(Array.isArray(input) && input.length <= 12);
  const ids=[...new Set(input.map((item)=>needed(item)))];
  requireRule(await tx.employee.count({where:{id:{in:ids},archived:false}})===ids.length);
  return ids;
}
export async function appointment(tx:Tx,input:Input,actor:Actor):Promise<Change> {
  const id=text(input.id,120);
  const before=id ? await tx.document.findFirst({where:{id,kind:"appointment"},include:{assignments:true}}) : null;
  checkVersion(before,input);
  requireRule(!before || ["scheduled","arrived"].includes(before.status),"invalidStatus");
  const partyId=await validParty(tx,input.partyId,"customer");
  const vehicleId=input.vehicleId ? (await validVehicle(tx,input.vehicleId,partyId)).id : null;
  const staff=await assignmentIds(tx,input.employees);
  const at=date(needed(input.at,20));
  const duration=integer(input.duration || 60,15,720);
  const end=at.getTime()+duration*60000;
  const possible=staff.length ? await tx.document.findMany({where:{kind:"appointment",status:{in:["scheduled","arrived"]},
    id:{not:id},at:{gte:new Date(at.getTime()-720*60000),lt:new Date(end)},assignments:{some:{employeeId:{in:staff}}}},select:{at:true,metadata:true}}) : [];
  const overlap=possible.some((apt)=>apt.at.getTime()+Number((apt.metadata as {duration?:number}).duration ?? 60)*60000>at.getTime());
  requireRule(!overlap || text(input.reason,800),"appointmentOverlap",409);
  const data={partyId,vehicleId,at,title:needed(input.title),note:text(input.note),metadata:{duration,override:overlap?text(input.reason):""},
    snapshot:await snapshot(tx,partyId,vehicleId)};
  const after=before ? await tx.document.update({where:{id},data:{...data,version:{increment:1}}}) :
    await document(tx,actor,"appointment",{...data,status:"scheduled"});
  await tx.assignment.deleteMany({where:{documentId:after.id}});
  await tx.assignment.createMany({data:staff.map((employeeId)=>({documentId:after.id,employeeId}))});
  return {id:after.id,entity:"document",before,after:{...after,staff}};
}
export async function appointmentStatus(tx:Tx,input:Input):Promise<Change> {
  const id=needed(input.id);
  const before=await tx.document.findFirst({where:{id,kind:"appointment"}});
  checkVersion(before,input);
  requireRule(before);
  const status=choice(input.status,appointmentStates);
  const after=await tx.document.update({where:{id},data:{status,version:{increment:1}}});
  return {id,entity:"document",before,after};
}
export async function job(tx:Tx,input:Input,actor:Actor):Promise<Change> {
  const sourceId=text(input.sourceId,120) || undefined;
  const source=sourceId ? await tx.document.findFirst({where:{id:sourceId,kind:"appointment",status:{in:["scheduled","arrived"]}},include:{assignments:true}}) : null;
  requireRule(!sourceId || source,"invalidStatus");
  if(source) requireRule(!(await tx.document.findFirst({where:{kind:"job",sourceId}})),"alreadyPosted",409);
  const partyId=await validParty(tx,source?.partyId ?? input.partyId,"customer");
  const car=await validVehicle(tx,source?.vehicleId ?? input.vehicleId,partyId);
  const mileage=input.mileage ? integer(input.mileage,0,9999999) : null;
  if(mileage!==null && car.mileage!==null && mileage<car.mileage) requireRule(text(input.reason),"lowerMileage");
  const staff=input.employees ? await assignmentIds(tx,input.employees) : source?.assignments.map((row)=>row.employeeId) ?? [];
  const at=date(input.at);
  const after=await document(tx,actor,"job",{status:"new",sourceId,partyId,vehicleId:car.id,at,
    title:needed(input.title || source?.title),note:text(input.note ?? source?.note),
    metadata:json({mileage,requested:text(input.requested),inspection:text(input.inspection)}),snapshot:await snapshot(tx,partyId,car.id)});
  if (mileage!==null) {
    await tx.vehicleEvent.create({data:{vehicleId:car.id,kind:"mileage",actorId:actor.id,at,data:{mileage,jobId:after.id,reason:text(input.reason)}}});
    await tx.vehicle.update({where:{id:car.id},data:{mileage,version:{increment:1}}});
  }
  if (source) await tx.document.update({where:{id:source.id},data:{status:"arrived",version:{increment:1}}});
  await tx.assignment.createMany({data:staff.map((employeeId)=>({documentId:after.id,employeeId}))});
  return {id:after.id,entity:"document",after:{...after,staff}};
}
export async function jobUpdate(tx:Tx,input:Input,actor:Actor):Promise<Change> {
  const id=needed(input.id);
  const before=await tx.document.findFirst({where:{id,kind:"job"},include:{jobStock:true}});
  checkVersion(before,input);
  requireRule(before && before.status!=="cancelled","invalidJob");
  const status=choice(input.status,jobStates);
  requireRule(before.status!=="delivered" || status==="delivered","invalidStatus");
  const intake=workshopIntake(before.metadata);
  let dateChanges: { deliveryDate?: string } = {};
  if (intake) {
    if (status==="delivered") {
      if (before.status!=="delivered" || input.deliveryDate !== undefined) {
        requireRule(intake.jobMode==="stay","invalidStatus");
        dateChanges={deliveryDate:jobEndDate(input.deliveryDate, before.at)};
      }
    } else if (status!=="cancelled") {
      requireRule(intakeStatuses.some((value)=>value===status),"invalidStatus");
    }
  }
  if (status==="cancelled") {
    requireRule(!before.jobStock.some((row)=>row.issued.gt(0)),"reconcileJob");
    requireRule(!await tx.document.findFirst({where:{sourceId:id,kind:"invoice",status:"posted"}}),"reconcileJob");
    requireRule(!await tx.payment.findFirst({where:{kind:"receipt",reversedAt:null,snapshot:{path:["jobId"],equals:id}}}),"reconcileJob");
    const reason=needed(input.reason,800);
    for (const row of before.jobStock.filter((row)=>row.reserved.gt(0))) {
      await move(tx,actor,{partId:row.partId,documentId:id,kind:"release",reserve:row.reserved.negated(),reason});
      await tx.jobStock.update({where:{documentId_partId:{documentId:id,partId:row.partId}},data:{reserved:0}});
    }
  }
  const old=before.metadata as Record<string,unknown>;
  const after=await tx.document.update({where:{id},data:{status,version:{increment:1},note:text(input.note ?? before.note),
    metadata:json({...old,inspection:text(input.inspection ?? old.inspection),work:text(input.work ?? old.work),
      ecu:text(input.ecu ?? old.ecu),tcu:text(input.tcu ?? old.tcu),dynoBefore:text(input.dynoBefore ?? old.dynoBefore,50),
      dynoAfter:text(input.dynoAfter ?? old.dynoAfter,50),followUp:text(input.followUp ?? old.followUp,50),
      followMileage:text(input.followMileage ?? old.followMileage,50),reason:text(input.reason),
      ...dateChanges,
      ...(status==="delivered" && !old.deliveredAt ? {deliveredAt:new Date().toISOString()} : {})})}});
  if(before.vehicleId && text(input.stage,100)){
    const vehicle=await tx.vehicle.findUniqueOrThrow({where:{id:before.vehicleId}});
    const stage=text(input.stage,100);
    if(vehicle.stage!==stage){
      await tx.vehicle.update({where:{id:vehicle.id},data:{stage,version:{increment:1}}});
      await tx.vehicleEvent.create({data:{vehicleId:vehicle.id,kind:"stage",actorId:actor.id,data:{stage,previous:vehicle.stage,jobId:id}}});
    }
  }
  return {id,entity:"document",before,after};
}
export async function jobAssignment(tx:Tx,input:Input):Promise<Change> {
  const id=needed(input.id);
  const before=await tx.document.findFirst({where:{id,kind:"job",status:{not:"cancelled"}},include:{assignments:true}});
  checkVersion(before,input);
  requireRule(before,"invalidJob");
  const staff=await assignmentIds(tx,input.employees);
  const completed=await assignmentIds(tx,input.completed);
  requireRule(completed.every((employeeId)=>staff.includes(employeeId)));
  await tx.assignment.deleteMany({where:{documentId:id}});
  const assignments=staff.map((employeeId)=>({documentId:id,employeeId,completed:completed.includes(employeeId)}));
  await tx.assignment.createMany({data:assignments});
  const after=await tx.document.update({where:{id},data:{version:{increment:1}}});
  return {id,entity:"document",before,after:{...after,assignments}};
}

