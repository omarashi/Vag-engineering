import Link from "./navigation-link";
import Form from "next/form";
import { ArrowUpRight, ChevronLeft, ChevronRight, Download, Filter, Search } from "lucide-react";
import type { ReactNode } from "react";
import type { PaymentKind } from "@prisma/client";
import { ActionForm, type ActionSpec, type Option } from "./backoffice-form";
import { Badge, Empty, Panel, ButtonLink } from "./ui";
import { day, label, money, translate, type Language } from "@/lib/locale";
import type { Filters } from "@/lib/views";
import type { Forms } from "@/lib/forms";
import { serviceName, serviceTypes } from "@/lib/services";
import { carName } from "@/lib/car-name";
import { jobModeLabel, visitTitle, workshopIntake } from "@/lib/visit-items";

export type Cell=ReactNode;
export function Ref({href,children}:{href:string;children:ReactNode}) { return <Link href={href} className="id-link"><bdi>{children}</bdi></Link>; }
export function Amt({lang,value}:{lang:Language;value:string|bigint|number|null|undefined}) {return value==null?"—":<bdi>{money(lang,value)}</bdi>;}
export function Register({lang,head,rows}:{lang:Language;head:string[];rows:Cell[][]}){
  return rows.length?<div className="table-scroll"><table><thead><tr>{head.map((name,index)=><th key={index} scope="col">{translate(lang,name)}</th>)}</tr></thead>
    <tbody>{rows.map((row,index)=><tr key={index}>{row.map((cell,idx)=><td key={idx}>{cell ?? "—"}</td>)}</tr>)}</tbody></table></div>:<Empty lang={lang}/>;
}
export function Heading({lang,title,description,children}:{lang:Language;title:string;description?:string;children?:ReactNode}){
  return <header className="page-heading"><div><h1>{translate(lang,title)}</h1>{description&&<p>{description}</p>}</div>{children&&<div className="page-actions">{children}</div>}</header>;
}
export function CashAccountSetup({lang,canManage,primary=false}:{lang:Language;canManage:boolean;primary?:boolean}){
  return canManage ? <ButtonLink href="/settings?new=account" primary={primary}>{translate(lang,"Set up a cash account")}</ButtonLink>
    : <p className="notice">{translate(lang,"Ask the owner to set up a cash account.")}</p>;
}
export function Actions({lang,forms,specs,auto="",primary=true}:{lang:Language;forms:Forms;specs:(ActionSpec|false|null|undefined)[];auto?:string;primary?:boolean}){
  const permitted=specs.filter((spec):spec is ActionSpec=>Boolean(spec&&forms.can(spec.action)));
  return permitted.map((spec,index)=><ActionForm key={spec.action+"-"+spec.title} lang={lang} spec={spec} primary={primary&&index===0} auto={auto===spec.action}/>);
}
export function Info({lang,title="Details",items}:{lang:Language;title?:string;items:[string,ReactNode][]}){
  const values=items.filter(([,value])=>value!==null&&value!==undefined&&value!=="");
  if(!values.length)return null;
  return <Panel title={translate(lang,title)}><div className="detail-grid">{values.map(([key,value],i)=><div className="detail-item" key={i}><small>{translate(lang,key)}</small><b>{typeof value==="string"?<bdi>{value}</bdi>:value}</b></div>)}</div></Panel>;
}
function dropdown(name:string,options:Option[],selected?:string){
  return <select name={name} aria-label={name} defaultValue={selected ?? ""}><option value="">—</option>{options.map((option)=><option key={option.value} value={option.value}>{option.name}</option>)}</select>;
}
export function Toolbar({lang,path,filters,dateRange=false,status,party,staff,category=false,workServices=false,report,paymentKinds}:{lang:Language;path:string;filters:Filters;dateRange?:boolean;status?:string[];party?:Option[];staff?:Option[];category?:boolean;workServices?:boolean;report?:string;paymentKinds?:PaymentKind[]}){
  const tr=(name:string)=>translate(lang,name);
  return <Form key={JSON.stringify(filters)} className="toolbar" action={path} prefetch={false}>
    {report&&<input type="hidden" name="report" value={report}/>}
    <label className="search-box"><Search size={16}/><input aria-label={tr("Search")} name="q" defaultValue={filters.q} placeholder={tr("Search records")}/></label>
    {dateRange&&<><input aria-label={tr("From")} type="date" name="from" defaultValue={filters.from}/><input aria-label={tr("To")} type="date" name="to" defaultValue={filters.to}/></>}
    {status&&dropdown("status",status.map((value)=>({value,name:value==="archived"?tr("Archived"):value==="active"?tr("Open"):label(lang,value)})),filters.status)}
    {party&&dropdown("party",party,filters.party)}{staff&&dropdown("staff",staff,filters.staff)}
    {paymentKinds&&<select name="paymentKind" aria-label={tr("Payment type")} defaultValue={filters.paymentKind ?? ""}>
      <option value="">{tr("All payment types")}</option>
      {paymentKinds.map((kind)=><option key={kind} value={kind}>{label(lang,kind)}</option>)}
    </select>}
    {workServices&&<select name="service" aria-label={tr("Service")} defaultValue={filters.service}>
      <option value="">{tr("All services")}</option>
      {serviceTypes.map((service)=><option key={service} value={service}>{serviceName(lang,service)}</option>)}
    </select>}
    {category&&<input name="category" aria-label={tr("Category")} placeholder={tr("Category")} defaultValue={filters.category}/>}
    <button className="button secondary" type="submit"><Filter size={14}/>{tr("Filter")}</button><Link className="button ghost" href={path+(report?"?report="+report:"")}>{tr("Clear")}</Link>
  </Form>;
}
export function Pages({lang,path,filters,count,report}:{lang:Language;path:string;filters:Filters;count:number;report?:string}){
  const page=Math.max(0,parseInt(filters.page??"0",10)||0);
  if(page===0&&count<100)return null;
  const query=(next:number)=>new URLSearchParams(Object.entries({...filters,report,page:String(next)}).filter((pair):pair is [string,string]=>Boolean(pair[1]))).toString();
  return <div className="sequences">
    {page>0?<ButtonLink href={path+"?"+query(page-1)}><ChevronLeft size={14}/>{translate(lang,"Back")}</ButtonLink>:<span/>}
    <span>{translate(lang,"Showing up to 100 records. Refine the filters to see more.")}</span>
    {count>=100?<ButtonLink href={path+"?"+query(page+1)}>{translate(lang,"Next")}<ChevronRight size={14}/></ButtonLink>:<span/>}
  </div>;
}
type Doc={id:string;number:string;kind:string;at:Date;dueAt?:Date|null;title?:string;status:string;reference?:string;total:bigint;due?:bigint|null;metadata?:unknown;
  party?:{name:string}|null;employee?:{name:string}|null;vehicle?:{make:string;model:string;color:string;plate:string}|null;category?:string};
export function DocRegister({lang,docs,mode="financial"}:{lang:Language;docs:Doc[];mode?:"financial"|"jobs"}){
  const tr=(name:string)=>translate(lang,name);
  if(mode==="jobs")return docs.length ? <ul className="log-list">{docs.map((row)=>{
    const related=[row.party?.name,row.vehicle && carName(row.vehicle),row.vehicle?.plate].filter(Boolean).join(" · ");
    const intake=workshopIntake(row.metadata);
    return <li key={row.id}><Link className="log-list-link" href={"/jobs/"+row.id}>
      <span className="log-row-main">
        <strong><bdi>{visitTitle(lang,{title:row.title || "",category:row.category || "",metadata:row.metadata})}</bdi></strong>
        {related&&<small><bdi>{related}</bdi></small>}
        <small><bdi>{row.number}</bdi> · {day(lang,row.at)}{intake&&" · "+tr(jobModeLabel(intake.jobMode))}</small>
      </span>
      <Badge lang={lang} value={row.status}/>
    </Link></li>;
  })}</ul> : <Empty lang={lang}/>;
  return <Register lang={lang} head={["Number","Type","Date","Name","Status","Total","Amount due","Due date"]} rows={docs.map((row)=>[
    <Ref href={"/record/"+row.id}>{row.number}</Ref>,label(lang,row.kind),day(lang,row.at),<bdi>{row.party?.name || row.employee?.name || row.title || row.reference}</bdi>,
    <Badge lang={lang} value={row.status}/>,<Amt lang={lang} value={row.total}/>,<Amt lang={lang} value={row.due}/>,
    row.dueAt?<span className={BigInt(row.due ?? 0)>0n&&new Date(row.dueAt)<new Date()?"text-red-400":""}>{day(lang,row.dueAt)}{BigInt(row.due??0)>0n&&new Date(row.dueAt)<new Date()&&" · "+tr("Overdue")}</span>:"—",
  ])}/>;
}
type Pay={id:string;number:string;kind:string;at:Date;amount:bigint;party?:{name:string}|null;employee?:{name:string}|null;reversedAt:Date|null;method:string};
export function PayRegister({lang,rows}:{lang:Language;rows:Pay[]}){
  return <Register lang={lang} head={["Number","Type","Date","Name","Payment method","Amount","Status"]} rows={rows.map((row)=>[
    <Ref href={"/payment/"+row.id}>{row.number}</Ref>,label(lang,row.kind),day(lang,row.at),<bdi>{row.party?.name || row.employee?.name}</bdi>,label(lang,row.method),
    <Amt lang={lang} value={row.amount}/>,<Badge lang={lang} value={row.reversedAt?"reversed":"posted"}/>,
  ])}/>;
}
export function ExportLink({lang,report,filters}:{lang:Language;report:string;filters:Filters}){
  const query=new URLSearchParams(Object.entries({...filters,lang,report}).filter((pair):pair is [string,string]=>Boolean(pair[1])));
  return <a className="button secondary" href={"/api/export?"+query}><Download size={14}/>{translate(lang,"Download CSV")}</a>;
}
export function PrintLink({lang,type,id,text}:{lang:Language;type:string;id:string;text?:string}){
  return <ButtonLink href={"/print/"+type+"/"+id+"?lang="+lang}><ArrowUpRight size={14}/>{translate(lang,text??(type==="statement"?"Print statement":"Print A4"))}</ButtonLink>;
}

