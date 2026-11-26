import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { reportRows } from "@/lib/views";
import { partCodeLabel, translate } from "@/lib/locale";
import { audit } from "@/lib/transaction";
import { db } from "@/lib/db";
const heads:Record<string,string[]>={
  statement:["Date","Number","Type","Amount","Running balance"],stock:["Part","Category","In stock","Cost","Price","Total cost","Total selling value"],
  payments:["Number","Type","Date","Name","Amount","Payment method","Accounts"],
};
const common=["Number","Type","Date","Name","Total","Amount due"];
const allowed=["statement","stock","payments","sales","purchases","expenses","payroll","debts"];
function csv(value:string){
  const cell=/^\s*[=+@-]/.test(value)?"'"+value:value;
  return '"'+cell.replaceAll('"','""')+'"';
}
export async function GET(request:Request){
  const user=await currentUser(request.headers);
  if(!user)return Response.json({error:"unauthenticated"},{status:401});
  if(!can(user.role,"export"))return Response.json({error:"forbidden"},{status:403});
  const params=new URL(request.url).searchParams;
  const lang=params.get("lang")==="ar"?"ar":"en";
  const report=params.get("report") ?? "";
  if(!allowed.includes(report))return Response.json({error:"invalid"},{status:422});
  const filters=Object.fromEntries([...params.entries()].map(([key,value])=>[key,value.slice(0,120)]));
  const rows=await reportRows(report,filters,lang);
  const columns=report==="stock" ? [partCodeLabel(lang),...heads.stock] : heads[report] ?? common;
  const data=[columns.map((key)=>translate(lang,key)),...rows].map((row)=>row.map(csv).join(",")).join("\r\n");
  await audit(db,user.id,"export","report",report,null,{rowCount:rows.length,lang});
  return new Response("\ufeff"+data,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="vag-'+report+'.csv"',"Cache-Control":"private, no-store"}});
}

