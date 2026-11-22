import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { reportRows } from "@/lib/views";
import { translate } from "@/lib/locale";
const heads:Record<string,string[]>={
  statement:["Date","Number","Type","Amount","Running balance"],stock:["Code","Part","Category","On hand","Reserved","Available","Cost"],
  payments:["Number","Type","Date","Name","Amount"],
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
  const data=[[...(heads[report] ?? common)].map((key)=>translate(lang,key)),...rows].map((row)=>row.map(csv).join(",")).join("\r\n");
  return new Response("\ufeff"+data,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="vag-'+report+'.csv"',"Cache-Control":"private, no-store"}});
}

