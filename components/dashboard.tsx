import { ArrowUpRight, CalendarDays, CarFront, ChevronRight, CircleDollarSign, ClipboardList, Package, Plus, ReceiptText, Wallet, Wrench } from "lucide-react";
import Link from "./navigation-link";
import { Badge, ButtonLink, Empty, Panel } from "./ui";
import { clock, day, money, translate, type Language } from "@/lib/locale";
import type { overview } from "@/lib/views";

type Data=Awaited<ReturnType<typeof overview>>;
export function Dashboard({lang,data}:{lang:Language;data:Data}){
  const tr=(key:string)=>translate(lang,key);
  const stats=[
    {label:"Active jobs",value:String(data.active),detail:"Open workshop orders",href:"/jobs",icon:Wrench,tone:"red"},
    {label:"Invoiced sales",value:money(lang,data.sales),detail:"This month · EGP",href:"/reports",icon:ReceiptText,tone:"green"},
    {label:"Customer debt",value:money(lang,data.debt),detail:"Outstanding receivables",href:"/balances",icon:CircleDollarSign,tone:"gold"},
  ];
  const max=Math.max(1,...data.series.map((row)=>Number(row.amount)));
  return <>
    <div className="page-heading"><div><h1>{tr("Workshop overview")}</h1><p>{tr("Current workshop activity and financial position.")}</p></div>
      <ButtonLink primary href="/jobs?new=job"><Plus size={17}/>{tr("New job")}</ButtonLink></div>
    <section aria-label={tr("Financial summary")} className="stats-grid business-stats">
      {stats.map(({icon:Icon,...stat})=><Link key={stat.label} href={stat.href} className="stat panel"><div className="stat-top"><div className={"tile-icon "+stat.tone}><Icon size={18}/></div><ArrowUpRight size={16}/></div>
        <div className="stat-label">{tr(stat.label)}</div><strong><bdi>{stat.value}</bdi></strong><small>{tr(stat.detail)}</small></Link>)}
    </section>
    <div className="business-chart">
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
    </div>
    <div className="dashboard-columns">
      <Panel title={tr("Workshop queue")} icon={<ClipboardList size={17}/>} link="/jobs" linkLabel={tr("View all jobs")}>
        {data.queue.length?<div className="table-scroll"><table><thead><tr>{["Job number","Vehicle","Service","Status"].map((key)=><th key={key}>{tr(key)}</th>)}</tr></thead>
        <tbody>{data.queue.map((row)=><tr key={row.id}><td><Link className="id-link" href={"/jobs/"+row.id}><bdi>{row.number}</bdi></Link></td>
          <td><span className="vehicle-cell"><CarFront size={16}/><bdi>{[row.vehicle?.make,row.vehicle?.model].filter(Boolean).join(" ")}</bdi></span></td>
          <td><bdi>{row.title}</bdi></td><td><Badge lang={lang} value={row.status}/></td></tr>)}</tbody></table></div>:<Empty lang={lang} text="No activity yet"/>}
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

