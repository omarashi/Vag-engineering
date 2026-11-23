import { ArrowUpRight, ChevronRight, CircleDollarSign, Package, ReceiptText, Wallet } from "lucide-react";
import Link from "./navigation-link";
import { Heading } from "./register";
import { Empty, Panel } from "./ui";
import { money, translate, type Language } from "@/lib/locale";
import type { overview } from "@/lib/views";

type Data=Awaited<ReturnType<typeof overview>>;
export function Dashboard({lang,data}:{lang:Language;data:Data}){
  const tr=(key:string)=>translate(lang,key);
  const stats=[
    {label:"Invoiced sales",value:money(lang,data.sales),detail:"This month · EGP",href:"/reports",icon:ReceiptText,tone:"green"},
    {label:"Customer debt",value:money(lang,data.debt),detail:"Outstanding receivables",href:"/debts",icon:CircleDollarSign,tone:"gold"},
  ];
  const max=Math.max(1,...data.series.map((row)=>Number(row.amount)));
  return <>
    <Heading lang={lang} title="Workshop overview"/>
    <section aria-label={tr("Financial summary")} className="stats-grid business-stats">
      {stats.map(({icon:Icon,...stat})=><Link key={stat.label} href={stat.href} className="stat panel"><div className="stat-top"><div className={"tile-icon "+stat.tone}><Icon size={18}/></div><ArrowUpRight size={16}/></div>
        <div className="stat-label">{tr(stat.label)}</div><strong><bdi>{stat.value}</bdi></strong><small>{tr(stat.detail)}</small></Link>)}
    </section>
    <div className="dashboard-columns">
      <Panel title={tr("Cash collections")} icon={<Wallet size={17}/>} link="/reports" linkLabel={tr("View reports")} className="chart-card">
        <div className="chart-summary"><strong><bdi>{money(lang,data.collections)}</bdi></strong><span>{tr("This month · EGP")}</span></div>
        <div className="chart">
          <div className="chart-grid" aria-hidden="true"><i/><i/><i/><i/></div>
          {data.dates.map((date)=>{
            const sales=Number(data.series.find((row)=>row.day===date&&row.series==="sales")?.amount ?? 0);
            const collected=Number(data.series.find((row)=>row.day===date&&row.series==="receipts")?.amount ?? 0);
            const weekday=new Intl.DateTimeFormat(lang==="ar"?"ar-EG":"en-GB",{weekday:"short",timeZone:"Africa/Cairo"}).format(new Date(date+"T12:00Z"));
            return <div key={date} className="chart-group"><div className="bar-space"><div title={tr("Invoice sales")+" "+money(lang,sales)} className="bar sale" style={{height:Math.max(2,sales/max*100)+"%"}}/><div title={tr("Collections")+" "+money(lang,collected)} className="bar collected" style={{height:Math.max(2,collected/max*100)+"%"}}/></div><span>{weekday}</span></div>;
          })}
        </div>
        <div className="chart-legend"><span><i/>{tr("Invoice sales")}</span><span><i/>{tr("Collections")}</span><small>{tr("Last 7 days")}</small></div>
      </Panel>
      <Panel title={tr("Low stock")} icon={<Package size={17}/>} link="/inventory" linkLabel={tr("View inventory")}>
        {data.stock.length?<div className="appointment-list">{data.stock.map((row)=><Link className="appointment-row" key={row.id} href={"/inventory/"+row.id}>
          <div className="tile-icon gold"><Package size={17}/></div><div className="appt-info"><b>{row.name}</b><small><bdi>{row.code}</bdi></small></div><span className="stock-count">{row.available} / {row.minimum}</span>
        </Link>)}</div>:<Empty lang={lang} text="Stock is above minimum levels"/>}
      </Panel>
    </div>
    <div className="footer-metrics">{([["Supplier debt",data.supplier,"balances"],["Payroll due",data.payroll,"payroll"],["Cash & bank",data.cash,"cash"]] as const).map(([name,value,href])=><Link className="panel" href={"/"+href} key={name}><span>{tr(name)}</span><strong><bdi>{money(lang,value)}</bdi></strong><ChevronRight size={16}/></Link>)}</div>
  </>;
}

