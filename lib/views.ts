import { PaymentKind, Prisma, type DocumentKind } from "@prisma/client";
import { db, plain } from "./db";
import { date, today } from "./rules";
import { documentAmountDue, due } from "./trade";
import { day, label, money, type Language } from "./locale";
import { workSearch, workServiceFilter } from "./visits";

export type Filters={q?:string;from?:string;to?:string;status?:string;party?:string;staff?:string;category?:string;vehicle?:string;page?:string;paymentKind?:PaymentKind;service?:string};
export const includes={
  party:true,vehicle:true,employee:true,source:{select:{id:true,number:true,kind:true}},
  assignments:{include:{employee:true}},lines:{orderBy:{position:"asc" as const}},
  jobStock:{include:{part:true}},attachments:true,
  related:{where:{kind:{not:"quote"}},select:{id:true,number:true,kind:true,status:true,total:true}},
  payroll:{orderBy:{at:"asc" as const}},allocations:{include:{payment:true}},movements:{include:{part:true}},
} as const;

const textLike=(q:string)=>({contains:q,mode:"insensitive" as const});
function interval(filters:Filters){
  let gte:Date|undefined;
  let lt:Date|undefined;
  try{if(filters.from) gte=date(filters.from+"T00:00");}catch{}
  try{if(filters.to) lt=new Date(date(filters.to+"T00:00").getTime()+86400000);}catch{}
  return {gte,lt};
}
function offset(filters:Filters){return Math.min(Math.max(0,Number.parseInt(filters.page ?? "0",10)||0),500)*100;}
const isCredit = (kind:DocumentKind) => kind==="credit" || kind==="supplierCredit";

async function documentBalanceTotals(ids:string[]) {
  if (!ids.length) return { settled: new Map<string,bigint>(), credited: new Map<string|null,bigint>() };
  const [payments, credits] = await Promise.all([
    db.allocation.groupBy({
      by:["documentId"], where:{documentId:{in:ids},releasedAt:null,payment:{reversedAt:null}}, _sum:{amount:true},
    }),
    db.document.groupBy({
      by:["sourceId"], where:{sourceId:{in:ids},kind:{in:["credit","supplierCredit"]},status:"posted"}, _sum:{total:true},
    }),
  ]);
  return {
    settled: new Map(payments.map((row)=>[row.documentId,row._sum.amount ?? 0n])),
    credited: new Map(credits.map((row)=>[row.sourceId,row._sum.total ?? 0n])),
  };
}

export async function documents(kinds:DocumentKind[],filters:Filters={},options: {detail?:boolean;statuses?:string[];workshop?:boolean;unbilled?:boolean} = {}){
  const query=filters.q?.trim().slice(0,100);
  const like=query ? textLike(query) : undefined;
  const rows=await db.document.findMany({
    where:{kind:{in:kinds},at:interval(filters),status:options.statuses ? {in:options.statuses,equals:filters.status || undefined} : filters.status || undefined,
      partyId:filters.party || undefined,vehicleId:filters.vehicle || undefined,employeeId:filters.staff || undefined,category:filters.category || undefined,
      AND:options.workshop ? workServiceFilter(filters.service) : undefined,
      related:options.unbilled ? {none:{kind:"invoice",status:"posted"}} : undefined,
      ...(like?{OR:[{number:like},{title:like},{reference:like},{party:{OR:[{name:like},{phone:like}]}},{vehicle:{OR:[{plate:like},{vin:like},{model:like}]}},{employee:{name:like}},
        ...(options.workshop && query ? workSearch(query) : []),
      ]}:{})},
    include:options.detail ? includes : {party:true,vehicle:true,employee:true},orderBy:[{at:"desc"},{number:"desc"}],skip:offset(filters),take:100,
  });
  const ids = rows.filter((row)=>row.status==="posted" && financial(row.kind) && !isCredit(row.kind)).map((row)=>row.id);
  const { settled, credited } = await documentBalanceTotals(ids);
  return plain(await Promise.all(rows.map(async(row)=>{
    const balance = row.status!=="posted" || !financial(row.kind) ? null : isCredit(row.kind) ? await due(db,row)
      : documentAmountDue(row.total, settled.get(row.id) ?? 0n, credited.get(row.id) ?? 0n);
    return {...row,due:balance};
  })));
}
export const financial=(kind:DocumentKind)=>["invoice","purchase","customerOpening","supplierOpening","credit","supplierCredit","expense","payroll","employeeOpening","advanceOpening"].includes(kind);
export async function documentDetail(id:string){
  const row=await db.document.findUnique({where:{id,kind:{not:"quote"}},include:includes});
  if(!row) return null;
  const settlement=row.kind==="invoice"&&row.status==="posted"?{
    received:row.allocations.filter((item)=>!item.releasedAt&&!item.payment.reversedAt).reduce((sum,item)=>sum+item.amount,0n),
    credited:row.related.filter((item)=>isCredit(item.kind)&&item.status==="posted").reduce((sum,item)=>sum+item.total,0n),
  }:null;
  const balance=settlement?documentAmountDue(row.total,settlement.received,settlement.credited):
    row.status==="posted"&&financial(row.kind)?await due(db,row):null;
  return plain({...row,source:row.source?.kind==="quote"?null:row.source,due:balance,settlement});
}
export async function payments(filters:Filters={},id?:string,kinds?:PaymentKind[]){
  const like=filters.q ? textLike(filters.q.slice(0,100)) : undefined;
  const kind=filters.paymentKind&&Object.hasOwn(PaymentKind,filters.paymentKind)?filters.paymentKind:undefined;
  return plain(await db.payment.findMany({where:{id,kind:kinds ? {in:kinds} : kind,at:interval(filters),partyId:filters.party || undefined,employeeId:filters.staff || undefined,
    ...(like?{OR:[{number:like},{note:like},{party:{OR:[{name:like},{phone:like}]}},{employee:{name:like}}]}:{})},
    take:id?1:100,skip:id?0:offset(filters),orderBy:[{at:"desc"},{id:"desc"}],
    include:{party:true,employee:true,movements:{include:{account:true}},allocations:{include:{document:{select:{id:true,number:true,kind:true}}}}}}));
}
export async function parties(kind:"customer"|"supplier",filters:Filters={},id?:string){
  const like=filters.q ? textLike(filters.q.slice(0,100)) : undefined;
  return plain(await db.party.findMany({where:{kind,id,archived:filters.status==="archived" ? true : filters.status==="active" ? false : undefined,
    ...(like?{OR:[{name:like},{phone:like},{vehicles:{some:{OR:[{plate:like},{vin:like}]} }},{documents:{some:{kind:{not:"quote"},number:like}}}]}:{})},
    include:{_count:{select:{vehicles:true,documents:{where:{kind:{not:"quote"}}}}},...(id?{vehicles:true}:{})},orderBy:{name:"asc"},skip:id?0:offset(filters),take:id?1:100}));
}
export async function vehicles(filters:Filters={},id?:string){
  const like=filters.q ? textLike(filters.q.slice(0,100)) : undefined;
  return plain(await db.vehicle.findMany({where:{id,partyId:filters.party || undefined,
    archived:filters.status==="archived"?true:filters.status==="active"?false:undefined,
    ...(like?{OR:[{plate:like},{vin:like},{model:like},{make:like},{color:like},{party:{OR:[{name:like},{phone:like}]}},{documents:{some:{kind:{not:"quote"},number:like}}}]}:{})},
    include:{party:true,...(id?{history:{orderBy:{at:"desc" as const}},attachments:true,documents:{where:{kind:{not:"quote"}},orderBy:{at:"desc" as const}}}:{})},
    orderBy:{createdAt:"desc"},skip:id?0:offset(filters),take:id?1:100}));
}
export async function parts(filters:Filters={},id?:string){
  const like=filters.q ? textLike(filters.q.slice(0,100)) : undefined;
  const items=await db.part.findMany({where:{id,archived:filters.status==="archived"?true:filters.status==="active"?false:undefined,
    category: filters.category || undefined,...(like?{OR:[{code:like},{name:like},{oem:like},{brand:like}]}:{})},
    include:id?{movements:{take:100,orderBy:{at:"desc"},include:{document:{select:{number:true,id:true}}}}}:undefined,orderBy:{name:"asc"},skip:id?0:offset(filters),take:id?1:100});
  return plain(items.map((row)=>({...row,available:row.onHand.minus(row.reserved).toFixed(),low:row.onHand.minus(row.reserved).lte(row.minimum)})));
}
export async function selections(){
  const [customers,suppliers,cars,stock,staff,accounts,catalogue,payables,work]=await Promise.all([
    db.party.findMany({where:{kind:"customer",archived:false},orderBy:{name:"asc"},select:{id:true,name:true,phone:true}}),
    db.party.findMany({where:{kind:"supplier",archived:false},orderBy:{name:"asc"},select:{id:true,name:true}}),
    db.vehicle.findMany({where:{archived:false},select:{id:true,partyId:true,make:true,model:true,color:true,plate:true,mileage:true}}),
    db.part.findMany({where:{archived:false},orderBy:{name:"asc"},select:{id:true,name:true,code:true,cost:true,price:true,version:true,onHand:true}}),
    db.employee.findMany({where:{archived:false},orderBy:{name:"asc"},select:{id:true,name:true}}),
    db.moneyAccount.findMany({where:{archived:false},select:{id:true,name:true,kind:true}}),
    db.catalog.findMany({where:{archived:false},select:{id:true,name:true,price:true,group:true,description:true},orderBy:{name:"asc"}}),
    db.document.findMany({where:{kind:{in:["invoice","purchase","customerOpening","supplierOpening","credit","supplierCredit","expense","payroll","employeeOpening","advanceOpening"]},status:"posted"},
      select:{id:true,number:true,total:true,partyId:true,employeeId:true,kind:true},orderBy:{at:"desc"},take:1000}),
    db.document.findMany({where:{kind:"job",status:{not:"cancelled"}},select:{id:true,number:true,title:true,partyId:true},orderBy:{at:"desc"},take:500}),
  ]);
  return plain({customers,suppliers,cars,stock,staff,accounts,catalogue,payables,work});
}
export async function cashAccounts(){
  const rows=await db.moneyAccount.findMany({orderBy:{name:"asc"}});
  const sums=await db.cashMovement.groupBy({by:["accountId"],_sum:{amount:true}});
  return plain(rows.map((row)=>({...row,balance:sums.find((item)=>item.accountId===row.id)?._sum.amount ?? 0n})));
}
export async function ledgerSummary(filters:Filters={}){
  const {gte,lt}=interval(filters);
  const from=gte ?? new Date(0);
  const to=lt ?? new Date("9999-12-31");
  const party=filters.party || null;
  const category=filters.category || null;
  const rows=await db.$queryRaw<Array<{kind:string;total:bigint;cost:bigint}>>`
  SELECT d.kind::text AS kind, COALESCE(SUM(d.total),0)::bigint AS total,
    COALESCE(SUM(CASE WHEN d.kind='credit' THEN (SELECT SUM(l."costTotal") FROM "Line" l WHERE l."documentId"=d.id AND l."stockQty">0)
      ELSE (SELECT SUM(l."costTotal") FROM "Line" l WHERE l."documentId"=d.id) END),0)::bigint AS cost
  FROM "Document" d WHERE d."at">=${from} AND d."at"<${to}
    AND d.kind IN ('invoice','credit','purchase','supplierCredit','expense','payroll')
    AND (d.status='posted' OR (d.status='reversed' AND (d.metadata->>'reversedAt')::timestamptz>=${to}))
    AND (${party}::text IS NULL OR d."partyId"=${party}) AND (${category}::text IS NULL OR d.category=${category})
  GROUP BY d.kind`;
  const flow=await db.$queryRaw<Array<{kind:string;total:bigint;paid:bigint}>>`
    SELECT p.kind::text AS kind, COALESCE(SUM(c.amount),0)::bigint AS total,
    COALESCE(SUM(CASE WHEN c.amount<0 THEN -c.amount ELSE CASE WHEN c.reversal THEN -c.amount ELSE 0 END END),0)::bigint AS paid
    FROM "CashMovement" c JOIN "Payment" p ON p.id=c."paymentId"
    WHERE c.at>=${from} AND c.at<${to}
      AND p.kind NOT IN ('transfer','cashOpening','contribution','withdrawal')
      AND (${party}::text IS NULL OR p."partyId"=${party}) GROUP BY p.kind`;
  const total=(kind:string)=>rows.find((row)=>row.kind===kind)?.total ?? 0n;
  const cost=(kind:string)=>rows.find((row)=>row.kind===kind)?.cost ?? 0n;
  const collections=(flow.find((row)=>row.kind==="receipt")?.total ?? 0n)+(flow.find((row)=>row.kind==="refund")?.total ?? 0n);
  const costOfSales=cost("invoice")-cost("credit");
  return plain({sales:total("invoice"),credits:total("credit"),collections,cost:costOfSales,purchases:total("purchase"),expenses:total("expense"),
    margin:total("invoice")-total("credit")-costOfSales,paid:flow.filter((row)=>["supplierPayment","expensePayment","salaryPayment","advance","refund"].includes(row.kind)).reduce((sum,row)=>sum-row.total,0n)});
}
async function balances(){
  const [dueRows,availableRows]=await Promise.all([
    db.$queryRaw<Array<{kind:string;balance:bigint}>>`
      WITH credits AS (SELECT "sourceId", SUM(total) AS total FROM "Document" WHERE status='posted' AND kind IN ('credit','supplierCredit') GROUP BY "sourceId"),
        paid AS (SELECT a."documentId",SUM(a.amount) AS total FROM "Allocation" a JOIN "Payment" p ON p.id=a."paymentId"
          WHERE p."reversedAt" IS NULL AND a."releasedAt" IS NULL GROUP BY a."documentId")
      SELECT d.kind::text AS kind, COALESCE(SUM(GREATEST(0,d.total-COALESCE(c.total,0)-COALESCE(p.total,0))),0)::bigint AS balance
      FROM "Document" d LEFT JOIN credits c ON c."sourceId"=d.id LEFT JOIN paid p ON p."documentId"=d.id
      WHERE d.status='posted' AND d.kind IN ('invoice','customerOpening','purchase','supplierOpening','payroll','employeeOpening') GROUP BY d.kind`,
    db.$queryRaw<Array<{kind:string;balance:bigint}>>`
      SELECT p.kind::text, COALESCE(SUM(p.amount-COALESCE(a.total,0)),0)::bigint AS balance
      FROM "Payment" p LEFT JOIN (SELECT "paymentId",SUM(amount) AS total FROM "Allocation" WHERE "releasedAt" IS NULL GROUP BY "paymentId") a ON a."paymentId"=p.id
      WHERE p."reversedAt" IS NULL AND p.kind IN ('receipt','supplierPayment') GROUP BY p.kind`,
  ]);
  const tot=(list:typeof dueRows,kinds:string[])=>list.filter((row)=>kinds.includes(row.kind)).reduce((sum,row)=>sum+row.balance,0n);
  return {debt:tot(dueRows,["invoice","customerOpening"]),supplier:tot(dueRows,["purchase","supplierOpening"]),
    payroll:tot(dueRows,["payroll","employeeOpening"]),customerCredits:tot(availableRows,["receipt"]),supplierCredits:tot(availableRows,["supplierPayment"])};
}
export async function overview(){
  const now=new Date();
  const current=today(now);
  const starts=date(current+"T00:00");
  const next=new Date(starts.getTime()+86400000);
  const first=current.slice(0,7)+"-01";
  const monthStart=date(first+"T00:00");
  const dates=Array.from({length:7},(_,index)=>today(new Date(starts.getTime()-(6-index)*86400000+3600000)));
  const [stock,debt,financial,cash,series]=await Promise.all([
    db.$queryRaw<Array<{id:string;name:string;code:string;available:string;minimum:string}>>`SELECT id,name,code,("onHand"-reserved)::text AS available,minimum::text FROM "Part" WHERE NOT archived AND "onHand"-reserved<=minimum ORDER BY "onHand"-reserved ASC LIMIT 5`,
    balances(),ledgerSummary({from:today(monthStart),to:current}),
    db.cashMovement.aggregate({_sum:{amount:true}}),
    db.$queryRaw<Array<{day:string;series:string;amount:bigint}>>`
      SELECT ((d.at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Cairo')::date::text AS day,'sales' AS series, SUM(d.total)::bigint AS amount
      FROM "Document" d WHERE d.at>=${date(dates[0]+"T00:00")} AND d.at<${next} AND d.kind='invoice' AND d.status='posted' GROUP BY 1
      UNION ALL
      SELECT ((c.at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Cairo')::date::text AS day,'receipts' AS series, SUM(c.amount)::bigint AS amount
      FROM "CashMovement" c JOIN "Payment" p ON p.id=c."paymentId" WHERE c.at>=${date(dates[0]+"T00:00")} AND c.at<${next} AND p.kind IN ('receipt','refund') GROUP BY 1`,
  ]);
  return plain({stock,...debt,...financial,cash:cash._sum.amount ?? 0n,series,dates});
}
export async function statement(id:string){
  const party=await db.party.findUnique({where:{id}});
  if(!party) return null;
  const [docs,pays]=await Promise.all([
    db.document.findMany({where:{partyId:id,kind:{in:["invoice","purchase","credit","supplierCredit","customerOpening","supplierOpening"]},status:{in:["posted","reversed"]}}}),
    db.payment.findMany({where:{partyId:id},include:{allocations:{include:{document:{select:{number:true,id:true}}}}}}),
  ]);
  const ledger=[
    ...docs.flatMap((row)=>{const amount=["credit","supplierCredit"].includes(row.kind)?-row.total:row.total;
      const reverse=(row.metadata as {reversedAt?:string}).reversedAt;
      const line={id:row.id,number:row.number,kind:row.kind as string,at:row.at,amount,target:"record",links:[] as {id:string;number:string}[]};
      return reverse?[line,{...line,kind:"reversal",at:new Date(reverse),amount:-amount}]:[line];}),
    ...pays.flatMap((row)=>{const amount=["refund","supplierRefund"].includes(row.kind)?row.amount:-row.amount;
      const line={id:row.id,number:row.number,kind:row.kind as string,at:row.at,amount,target:"payment",links:row.allocations.filter((entry)=>!entry.releasedAt).map((entry)=>entry.document)};
      return row.reversedAt?[line,{...line,kind:"reversal",at:row.reversedAt,amount:-amount}]:[line];}),
  ].sort((a,b)=>a.at.getTime()-b.at.getTime());
  let balance=0n;
  return plain({party,rows:ledger.map((row)=>({...row,balance:balance+=row.amount}))});
}
export async function reportRows(kind:string,filters:Filters,lang:Language){
  if(kind==="statement" && filters.party){
    const value=await statement(filters.party);
    return value?.rows.map((row)=>[day(lang,row.at),row.number,label(lang,row.kind),money(lang,row.amount),money(lang,row.balance)]) ?? [];
  }
  if(kind==="stock") return (await parts(filters)).map((row)=>[row.code,row.name,row.category,String(row.onHand),String(row.reserved),row.available,money(lang,row.cost)]);
  if(kind==="payments") return (await payments(filters)).map((row)=>[row.number,label(lang,row.kind),day(lang,row.at),row.party?.name ?? row.employee?.name ?? "",money(lang,row.amount)]);
  const map:Record<string,DocumentKind[]>={sales:["invoice","credit"],purchases:["purchase","supplierCredit"],expenses:["expense"],payroll:["payroll","employeeOpening","advanceOpening"],
    debts:["invoice","customerOpening","purchase","supplierOpening"]};
  if(!map[kind]) return [];
  return (await documents(map[kind],filters)).filter((row)=>row.status==="posted").map((row)=>[
    row.number,label(lang,row.kind),day(lang,row.at),row.party?.name ?? row.employee?.name ?? "",money(lang,row.total),money(lang,row.due ?? 0n)]);
}

