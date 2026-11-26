import Link from "./navigation-link";
import Form from "next/form";
import { CalendarDays, CarFront, ChevronDown, ChevronLeft, ChevronRight, ShoppingCart } from "lucide-react";
import { db, plain } from "@/lib/db";
import { workshopPhotosEnabled, workshopPhotosOn } from "@/lib/workshop-photos";
import { supplierPriceList, supplierQuoteCode } from "@/lib/supplier-price-list";
import { carName } from "@/lib/car-name";
import { cashbook, cashbookDate, documents, inventoryFilters, inventoryValue, partCategories, parts, parties, payments, reportDocumentKinds,
  reportCashSummary, reportDocumentSummary, reportFilters, statement, vehicles, type Filters } from "@/lib/views";
import { ActionForm } from "./backoffice-form";
import { Actions, Amt, CashAccountSetup, DocRegister, ExportLink, Heading, Info, Pages, PayRegister, PrintLink, Ref, Register, Toolbar } from "./register";
import { Badge, ButtonLink, Panel } from "./ui";
import { date, today } from "@/lib/rules";
import { clock, day, label, partCodeLabel, translate, type Language } from "@/lib/locale";
import { closedJobStatuses, openJobStatuses } from "@/lib/workshop";
import type { Forms } from "@/lib/forms";
import { PaymentKind, type Role } from "@prisma/client";
import { can } from "@/lib/permissions";
import { accountName, accountTypeName } from "@/lib/payment-options";
import { ActionForm as JobActionForm } from "./action-form";
import { customerChoices, jobCarChoices, jobForm, newCustomerForJob, newCustomerLabel, receiverSuggestions, visitPartOptions } from "@/lib/visit-forms";

export type Query=Filters&{new?:string;report?:string;week?:string};
export type ModuleProps={lang:Language;forms:Forms;query:Query};

export async function Customers({lang,forms,query}:ModuleProps){
  const rows=await parties("customer",query);
  return <><Heading lang={lang} title="Customers"><Actions lang={lang} forms={forms} specs={[forms.party("customer")]} auto={query.new}/></Heading>
    <Toolbar lang={lang} path="/customers" filters={query} status={["active","archived"]}/>
    <div className="panel"><Register lang={lang} head={["Name","Phone","Vehicles","Documents","Status"]} rows={rows.map((row)=>[
      <Ref href={"/customers/"+row.id}>{row.name}</Ref>,<bdi>{row.phone}</bdi>,row._count.vehicles,row._count.documents,
      row.archived?translate(lang,"Archived"):translate(lang,"Open"),
    ])}/></div><Pages lang={lang} path="/customers" filters={query} count={rows.length}/></>;
}
export async function Vehicles({lang,forms,query}:ModuleProps){
  const rows=await vehicles(query);
  return <><Heading lang={lang} title="Vehicles"><Actions lang={lang} forms={forms} specs={[forms.vehicle()]} auto={query.new}/></Heading>
    <Toolbar lang={lang} path="/vehicles" filters={query} status={["active","archived"]} party={forms.adapters.customer}/>
    <div className="panel"><Register lang={lang} head={["Vehicle","Plate","Customer","Year","Tuning stage","Mileage"]} rows={rows.map((row)=>[
      <span className="vehicle-cell"><CarFront size={16}/><Ref href={"/vehicles/"+row.id}>{carName(row)}</Ref></span>,
      <bdi>{row.plate}</bdi>,<Ref href={"/customers/"+row.partyId}>{row.party.name}</Ref>,row.year,<bdi>{row.stage}</bdi>,row.mileage,
    ])}/></div><Pages lang={lang} path="/vehicles" filters={query} count={rows.length}/></>;
}
export async function Workshop({lang,query,role,view}:Omit<ModuleProps,"forms">&{role:Role;view:"open"|"history"|"billing"}){
  const billing=view==="billing";
  const history=!billing&&(view==="history"||closedJobStatuses.includes(query.status ?? ""));
  const statuses=billing?["delivered"]:history?closedJobStatuses:openJobStatuses;
  const filters={...query,new:undefined,status:statuses.includes(query.status ?? "")?query.status:undefined};
  const path=billing?"/jobs/billing":history?"/jobs/history":"/jobs";
  const mayTakePayment=can(role,"visitReceipt");
  const [docs,customers,cars,partOptions,receivers,photosEnabled]=await Promise.all([
    documents(["job","visit"],filters,{statuses,workshop:true,unbilled:billing}),
    customerChoices(),jobCarChoices(),visitPartOptions(lang),receiverSuggestions(),workshopPhotosOn(),
  ]);
  const t=(key:string)=>translate(lang,key);
  const search=new URLSearchParams();
  for(const key of ["q","from","to","party","service"] as const){
    const value=query[key];
    if(value)search.set(key,value);
  }
  const suffix=search.size?"?"+search.toString():"";
  return <><Heading lang={lang} title="Jobs">
    {customers.length
      ? <JobActionForm lang={lang} spec={jobForm(lang,{customers,cars,partOptions,receivers,mayTakePayment,photosEnabled})} primary auto={query.new==="job"}/>
      : <ButtonLink href={newCustomerForJob} primary>{t(newCustomerLabel)}</ButtonLink>}
    {can(role,"invoice")&&<ButtonLink href="/counter-sale"><ShoppingCart size={16}/>{t("Counter sale")}</ButtonLink>}
  </Heading>
    <nav className="job-views" aria-label={t("Job views")}>
      <Link className="button secondary" href={"/jobs"+suffix} aria-current={!history&&!billing?"page":undefined}>{t("Open jobs")}</Link>
      <Link className="button secondary" href={"/jobs/history"+suffix} aria-current={history?"page":undefined}>{t("Job history")}</Link>
      {mayTakePayment&&<Link className="button secondary" href={"/jobs/billing"+suffix} aria-current={billing?"page":undefined}>{t("Jobs to bill")}</Link>}
    </nav>
    <Toolbar lang={lang} path={path} filters={filters} dateRange status={billing?undefined:statuses} party={customers} workServices/>
    <div className="panel"><DocRegister lang={lang} docs={docs} mode="jobs"/></div>
    <Pages lang={lang} path={path} filters={filters} count={docs.length}/></>;
}
function StockValues({lang,totals}:{lang:Language;totals:Awaited<ReturnType<typeof inventoryValue>>}){
  const t=(key:string)=>translate(lang,key);
  const panel=(title:string,cost:string,selling:string)=><Panel title={t(title)}>
    <dl className="accounting-totals">
      <div><dt>{t("Total cost")}</dt><dd><Amt lang={lang} value={cost}/></dd></div>
      <div><dt>{t("Total selling value")}</dt><dd><Amt lang={lang} value={selling}/></dd></div>
    </dl>
  </Panel>;
  return <div className="module-grid">
    {panel("All stock values",totals.cost,totals.selling)}
    {totals.filtered&&panel("Filtered stock values",totals.filteredCost,totals.filteredSelling)}
  </div>;
}

export async function Inventory({lang,forms,query}:ModuleProps){
  const filters=inventoryFilters(query);
  const canManageParts=forms.can("part");
  const [rows,totals,categories]=await Promise.all([parts(filters),inventoryValue(filters),canManageParts?partCategories():[]]);
  return <><Heading lang={lang} title="Inventory">
    {canManageParts&&<ActionForm lang={lang} spec={{...forms.part(undefined,categories),title:"Add product"}} primary auto={query.new==="part"}
      source={{href:"/inventory/price-list",label:"Add from price list"}}/>}
    <Actions lang={lang} forms={forms} specs={[forms.stock()]} auto={query.new} primary={false}/>
  </Heading>
    <StockValues lang={lang} totals={totals}/>
    <Toolbar lang={lang} path="/inventory" filters={filters} category status={["active","archived"]}/>
    <div className="panel"><Register lang={lang} stickyKey head={[partCodeLabel(lang),"Part","Category","In stock","Cost","Price","Total cost","Total selling value"]} rows={rows.map((row)=>[
      <Ref href={"/inventory/"+row.id}>{row.code}</Ref>,<bdi>{row.name}</bdi>,<bdi>{row.category}</bdi>,
      <span className={row.low?"text-amber-400":""}>{String(row.onHand)} {row.unit}{row.low?" · "+translate(lang,"Low stock"):""}</span>,<Amt lang={lang} value={row.cost}/>,<Amt lang={lang} value={row.price}/>,
      <Amt lang={lang} value={row.stockCost}/>,<Amt lang={lang} value={row.stockSellingValue}/>,
    ])}/></div><Pages lang={lang} path="/inventory" filters={filters} count={rows.length}/></>;
}
export async function Purchasing({lang,forms,query}:ModuleProps){
  const tr=(key:string)=>translate(lang,key);
  const [suppliers,orders,purchases,priceList]=await Promise.all([
    parties("supplier",query),documents(["purchaseOrder"],query),documents(["purchase","supplierCredit"],query),
    forms.can("purchase") ? supplierPriceList() : null,
  ]);
  const activeParts=new Set(forms.adapters.parts.map(({value})=>value));
  const purchaseQuotes=priceList?.currency==="EGP" ? priceList.items
    .filter((item)=>!item.partId||activeParts.has(item.partId))
    .map((item)=>({value:supplierQuoteCode(item),description:item.description,brand:item.brand,cost:item.cost.toFixed(2),
      version:item.version ?? 0,linked:Boolean(item.partId)})) : [];
  return <><Heading lang={lang} title="Suppliers & purchasing">
    <Actions lang={lang} forms={forms} specs={[{...forms.purchase("purchase"),purchaseQuotes},forms.party("supplier")]} auto={query.new}/>
    {forms.can("purchase")&&<ButtonLink href="/purchasing/price-list">{tr("Supplier price list")}</ButtonLink>}
  </Heading>
    <Toolbar lang={lang} path="/purchasing" filters={query} dateRange party={forms.adapters.supplier}/>
    <div className="module-grid"><Panel title={tr("Purchases")}><DocRegister lang={lang} docs={purchases}/></Panel><Panel title={tr("Purchase orders")}><DocRegister lang={lang} docs={orders}/></Panel>
      <Panel title={tr("Suppliers")}><Register lang={lang} head={["Name","Phone","Contact","Documents"]} rows={suppliers.map((row)=>[
        <Ref href={"/purchasing/"+row.id}>{row.name}</Ref>,<bdi>{row.phone}</bdi>,<bdi>{row.contact}</bdi>,row._count.documents,
      ])}/></Panel></div><Pages lang={lang} path="/purchasing" filters={query} count={Math.max(suppliers.length,orders.length,purchases.length)}/></>;
}
export async function Invoices({lang,forms,query}:ModuleProps){
  const invoices=await documents(["invoice"],query);
  return <><Heading lang={lang} title="Invoices">
    {forms.can("invoice")&&<ButtonLink href="/counter-sale" primary><ShoppingCart size={16}/>{translate(lang,"Counter sale")}</ButtonLink>}
    <ButtonLink href="/receipts">{translate(lang,"Receipts")}</ButtonLink>
  </Heading>
    <Toolbar lang={lang} path="/invoices" filters={query} dateRange party={forms.adapters.customer}/>
    <div className="panel"><DocRegister lang={lang} docs={invoices}/></div>
    <Pages lang={lang} path="/invoices" filters={query} count={invoices.length}/></>;
}
export async function Balances({lang,forms,query}:ModuleProps){
  const tr=(key:string)=>translate(lang,key);
  const [docs,credit,allPays]=await Promise.all([
    documents(["purchase","supplierOpening"],{...query,status:"posted"}),
    documents(["credit","supplierCredit"],query),payments(query),
  ]);
  const statementData=query.party?await statement(query.party):null;
  const open=docs.filter((row)=>BigInt(row.due ?? 0)>0n);
  return <><Heading lang={lang} title="Balances & credits"><ButtonLink href="/debts">{tr("Customer debts")}</ButtonLink></Heading>
    <Toolbar lang={lang} path="/balances" filters={query} dateRange party={[...forms.adapters.customer,...forms.adapters.supplier]}/>
    <div className="module-grid">
      {statementData&&<Panel title={tr("Party statement")+" · "+statementData.party.name}><div className="detail-copy page-actions"><PrintLink lang={lang} type="statement" id={statementData.party.id}/>{forms.can("export")&&<ExportLink lang={lang} report="statement" filters={query}/>}</div>
        <Register lang={lang} head={["Date","Number","Type","Amount","Running balance","Allocations"]} rows={statementData.rows.map((row)=>[
          day(lang,row.at),<Ref href={"/"+row.target+"/"+row.id}>{row.number}</Ref>,label(lang,row.kind),<Amt lang={lang} value={row.amount}/>,<Amt lang={lang} value={row.balance}/>,
          <span className="flex flex-wrap gap-2">{row.links.map((item)=><Ref key={item.id} href={"/record/"+item.id}>{item.number}</Ref>)}</span>,
        ])}/></Panel>}
      <Panel title={tr("Supplier debt")}><DocRegister lang={lang} docs={open}/></Panel>
      <Panel title={tr("Posted credits")}><DocRegister lang={lang} docs={credit}/></Panel>
      <Panel title={tr("Unapplied")}><Register lang={lang} head={["Number","Type","Name","Amount"]} rows={allPays.filter((row)=>!row.reversedAt&&["receipt","supplierPayment"].includes(row.kind))
        .map((row)=>({...row,unapplied:BigInt(row.amount)-row.allocations.filter((item)=>!item.releasedAt).reduce((sum,item)=>sum+BigInt(item.amount),0n)})).filter((row)=>row.unapplied>0n)
        .map((row)=>[<Ref href={"/payment/"+row.id}>{row.number}</Ref>,label(lang,row.kind),<bdi>{row.party?.name}</bdi>,<Amt lang={lang} value={row.unapplied}/>])}/></Panel>
      {forms.can("payment")&&<details className="log-optional" open={query.new==="payment"||undefined}>
        <summary>{tr("Advanced payments")}<ChevronDown size={15} aria-hidden="true"/></summary>
        <div className="detail-copy page-actions"><Actions lang={lang} forms={forms} specs={[forms.payment()]} auto={query.new} primary={false}/></div>
      </details>}
    </div><Pages lang={lang} path="/balances" filters={query} count={Math.max(docs.length,credit.length,allPays.length)}/></>;
}
export async function Cash({lang,forms,query}:ModuleProps){
  const selected=cashbookDate(query.date);
  const [{rows,entries,total},expenses]=await Promise.all([
    cashbook(selected,query),documents(["expense"],{...query,page:undefined,from:query.from ?? selected,to:query.to ?? selected}),
  ]);
  const tr=(key:string)=>translate(lang,key);
  const activeAccounts=forms.adapters.accounts.length;
  return <><Heading lang={lang} title="Cash & expenses">
    <Actions lang={lang} forms={forms} specs={[activeAccounts>0&&forms.paidExpense(selected)]} auto={query.new}/>
    <ButtonLink href="/cash/transactions">{tr("View transactions")}</ButtonLink>
    {!activeAccounts&&<CashAccountSetup lang={lang} canManage={forms.can("account")}/>}
  </Heading>
    <div className="detail-stack">
      <Panel title={tr("Daily cashbook")}>
        <Form key={selected+query.account} action="/cash" prefetch={false} className="toolbar">
          <label className="accounting-filter">{tr("Date")}<input name="date" type="date" required defaultValue={selected} max={today()}/></label>
          <label className="accounting-filter">{tr("Account")}<select name="account" defaultValue={query.account ?? ""}>
            <option value="">{tr("All accounts")}</option>
            {rows.map((row)=><option key={row.id} value={row.id}>{accountName(row)}</option>)}
          </select></label>
          <button type="submit" className="button secondary">{tr("Filter")}</button>
        </Form>
        <dl className="accounting-totals">
          <div><dt>{tr("Total across accounts")}</dt><dd><Amt lang={lang} value={total}/></dd></div>
        </dl>
        <Register lang={lang} stickyKey head={["Account","Type","Opening balance","Money in","Money out","Closing balance"]} rows={rows.map((row)=>[
          <Ref href={"/cash?date="+selected+"&account="+encodeURIComponent(row.id)+"#cashbook-movements"}>{accountName(row)}</Ref>,
          accountTypeName(lang,row.kind),<Amt lang={lang} value={row.opening}/>,<Amt lang={lang} value={row.incoming}/>,
          <Amt lang={lang} value={row.outgoing}/>,<Amt lang={lang} value={row.closing}/>,
        ])}/>
      </Panel>
      {activeAccounts>0&&forms.can("payment")&&<details className="log-optional">
        <summary>{tr("More actions")}<ChevronDown size={15} aria-hidden="true"/></summary>
        <div className="detail-copy page-actions"><Actions lang={lang} forms={forms} specs={[
          activeAccounts>1&&forms.cashMovement("transfer"),forms.cashMovement("contribution"),forms.cashMovement("withdrawal"),
        ]} primary={false}/></div>
      </details>}
      <div id="cashbook-movements">
        <Panel title={tr("Money movements")}>
          <Register lang={lang} stickyKey head={["Number","Type","Account","Payment method","Details","Money in","Money out"]} rows={entries.map((row)=>{
            const {payment}=row;
            const docs=[...new Map(payment.allocations.filter(({releasedAt})=>!releasedAt || releasedAt>=row.at)
              .map(({document})=>[document.id,document])).values()];
            return [
              <Ref href={"/payment/"+payment.id}>{payment.number}</Ref>,
              row.reversal ? label(lang,"reversePayment") : label(lang,payment.kind),<bdi>{accountName(row.account)}</bdi>,label(lang,payment.method),
              <div className="accounting-entries">
                <bdi>{payment.party?.name || payment.employee?.name || docs.find(doc=>doc.kind==="expense")?.reference}</bdi>
                {payment.note && <bdi>{payment.note}</bdi>}
                {docs.map(doc=><Ref key={doc.id} href={"/record/"+doc.id}>{doc.number}{doc.kind==="expense" && " · "+doc.title}</Ref>)}
              </div>,
              row.amount>0n?<Amt lang={lang} value={row.amount}/>:null,row.amount<0n?<Amt lang={lang} value={-row.amount}/>:null,
            ];
          })}/>
        </Panel>
        <Pages lang={lang} path="/cash" filters={{...query,date:selected}} count={entries.length}/>
      </div>
      <Panel title={tr("Expenses")}>
        <Actions lang={lang} forms={forms} specs={[forms.expense()]} auto={query.new} primary={false}/>
        <DocRegister lang={lang} docs={expenses}/>
      </Panel>
    </div>
  </>;
}
export async function CashTransactions({lang,query,role}:Omit<ModuleProps,"forms">&{role:Role}){
  const [rows,parties]=await Promise.all([
    payments(query),
    db.party.findMany({where:{archived:false},select:{id:true,name:true},orderBy:{name:"asc"}}),
  ]);
  const tr=(key:string)=>translate(lang,key);
  const path="/cash/transactions";
  return <><Heading lang={lang} title="Transactions">
    <ButtonLink href="/cash">{tr("Cash & expenses")}</ButtonLink>
    {can(role,"export")&&<ExportLink lang={lang} report="payments" filters={query}/>}
  </Heading>
    <Toolbar lang={lang} path={path} filters={query} dateRange
      party={parties.map(({id,name})=>({value:id,name}))} paymentKinds={Object.values(PaymentKind)}/>
    <Panel title={tr("Money movements")}><PayRegister lang={lang} rows={rows} showAccounts/></Panel>
    <Pages lang={lang} path={path} filters={query} count={rows.length}/>
  </>;
}
export async function Opening({lang,forms,query}:ModuleProps){
  const [docs,cash,stock,closed]=await Promise.all([
    documents(["customerOpening","supplierOpening","employeeOpening","advanceOpening"],query),
    db.payment.findMany({where:{kind:"cashOpening"},orderBy:{at:"desc"},take:100}),
    db.stockMovement.findMany({where:{kind:"opening"},include:{part:true},orderBy:{at:"desc"},take:100}),
    db.setting.findUnique({where:{key:"openingFinal"}}),
  ]);
  return <><Heading lang={lang} title="Opening balances" description={translate(lang,closed?"Finalized":"Open")}><Actions lang={lang} forms={forms} specs={closed?[]:[forms.opening(),forms.stock(undefined,true),forms.payment(undefined,undefined,true),forms.openingFinalize()]} auto={query.new}/></Heading>
    <div className="module-grid"><Panel title={translate(lang,"Documents")}><DocRegister lang={lang} docs={docs}/></Panel>
      <Panel title={translate(lang,"Cash accounts")}><PayRegister lang={lang} rows={cash}/></Panel>
      <Panel title={translate(lang,"Stock movements")}><Register lang={lang} head={["Date","Part","Quantity","Cost","Reason"]} rows={stock.map((row)=>[
        day(lang,row.at),<Ref href={"/inventory/"+row.partId}>{row.part.name}</Ref>,String(row.quantity),<Amt lang={lang} value={row.totalCost}/>,<bdi>{row.reason}</bdi>,
      ])}/></Panel></div></>;
}
export async function Settings({lang,forms,query}:ModuleProps){
  const manageAccounts=forms.can("account");
  const [settings,catalogue,users,accounts]=await Promise.all([
    db.setting.findMany({where:{key:{in:["business","prefixes"]}}}),db.catalog.findMany({orderBy:[{group:"asc"},{name:"asc"}]}),
    forms.can("user")?db.user.findMany({select:{id:true,name:true,username:true,role:true,active:true,updatedAt:true},orderBy:{name:"asc"}}):[],
    manageAccounts?db.moneyAccount.findMany({orderBy:[{archived:"asc"},{name:"asc"}]}):[],
  ]);
  const business=(settings.find((row)=>row.key==="business")?.value ?? {}) as Record<string,string>;
  const prefixes=(settings.find((row)=>row.key==="prefixes")?.value ?? {}) as Record<string,string>;
  const tr=(key:string)=>translate(lang,key);
  const activeOwners=users.filter((row)=>row.role==="owner"&&row.active);
  return <><Heading lang={lang} title="Settings"><Actions lang={lang} forms={forms}
    specs={[forms.settings(business,prefixes),forms.catalogue(),forms.user(),manageAccounts&&forms.account()]} auto={query.new}/></Heading>
    <div className="module-grid"><Info lang={lang} title="Business settings" items={[["Business name",business.name ?? "VAG Engineering"],["Phone",business.phone],["Address",business.address],["Invoice footer",business.footer],["Date format",label(lang,business.dateFormat ?? "medium")],["Workshop photos",tr(workshopPhotosEnabled(business) ? "On" : "Off")]]}/>
      {manageAccounts&&<Panel title={tr("Cash accounts")}><Register lang={lang} head={["Account","Type","Status","Action"]} rows={accounts.map((row)=>[
        <bdi>{accountName(row)}</bdi>,accountTypeName(lang,row.kind),tr(row.archived?"Archived":"Active"),<ActionForm lang={lang} spec={forms.account(row)}/>,
      ])}/></Panel>}
      <Panel title={tr("Catalogue")}><Register lang={lang} head={["Type","Name","Description","Price","Action"]} rows={plain(catalogue).map((row)=>[
        label(lang,row.group),<bdi>{row.name}</bdi>,<bdi>{row.description}</bdi>,<Amt lang={lang} value={row.price}/>,forms.can("catalogue")?<ActionForm lang={lang} spec={forms.catalogue(row)}/>:null,
      ])}/></Panel>{forms.can("user")&&<Panel title={tr("Users")}><Register lang={lang} head={["Name","Username","Role","Status","Action"]} rows={plain(users).map((row)=>[
        <bdi>{row.name}</bdi>,<bdi>{row.username}</bdi>,label(lang,row.role),tr(row.active?"Active":"Disabled"),
        <ActionForm lang={lang} spec={forms.user(row,activeOwners.length===1&&activeOwners[0].id===row.id)}/>,
      ])}/></Panel>}</div></>;
}
export async function Audit({lang,query}:ModuleProps){
  const index=Math.min(500,Math.max(0,parseInt(query.page??"0",10)||0));
  const q=query.q?.slice(0,100);
  const rows=await db.audit.findMany({where:{action:{notIn:["quote","quoteApprove"]},
    ...(q?{OR:[{action:{contains:q,mode:"insensitive"}},{entityId:{contains:q,mode:"insensitive"}},{actor:{name:{contains:q,mode:"insensitive"}}}]}:{})},
    include:{actor:{select:{name:true}}},take:100,skip:100*index,orderBy:{at:"desc"}});
  return <><Heading lang={lang} title="Audit history"/><Toolbar lang={lang} path="/audit" filters={query}/>
    <div className="panel"><Register lang={lang} head={["Date","Actor","Action","Record","Change history"]} rows={rows.map((row)=>[
      day(lang,row.at)+" · "+clock(lang,row.at),<bdi>{row.actor.name}</bdi>,label(lang,row.action),<bdi>{row.entityId}</bdi>,
      <details><summary>{translate(lang,"View")}</summary><small>{translate(lang,"Before")}</small><pre dir="ltr" className="max-w-96 whitespace-pre-wrap break-all">{JSON.stringify(row.before,null,2)}</pre>
        <small>{translate(lang,"After")}</small><pre dir="ltr" className="max-w-96 whitespace-pre-wrap break-all">{JSON.stringify(row.after,null,2)}</pre></details>,
    ])}/></div><Pages lang={lang} path="/audit" filters={query} count={rows.length}/></>;
}
const reports:Record<string,string>={
  sales:"Invoiced sales",purchases:"Purchases",debts:"Document balances",expenses:"Expenses",payroll:"Employees & payroll",stock:"Stock",
};
export async function Reports({lang,forms,query}:ModuleProps){
  const tr=(key:string)=>translate(lang,key);
  const report=Object.hasOwn(reports,query.report ?? "")?query.report!:"sales";
  const filters=reportFilters(report,query);
  const kinds=reportDocumentKinds[report];
  const [summary,rows,stock,valuation,cash]=await Promise.all([
    kinds && report!=="debts" ? reportDocumentSummary(report,filters) : null,
    kinds?documents(kinds,filters):[],
    report==="stock"?parts(filters):[],
    report==="stock"?inventoryValue(filters):null,
    reportCashSummary(report,filters),
  ]);
  const saleLines=report==="sales"?await db.line.findMany({where:{documentId:{in:rows.map((row)=>row.id)}},include:{document:{select:{id:true,number:true}}},orderBy:[{documentId:"asc"},{position:"asc"}]}):[];
  const summaryItems:[string,bigint][] = !summary ? [] : report==="sales"
    ? [["Invoiced",summary.sales],["Posted credits",summary.credits],["Stock cost of sales",summary.cost],["Gross margin",summary.margin]]
    : report==="purchases" ? [["Purchases",summary.purchases],["Posted credits",summary.supplierCredits]]
    : report==="expenses" ? [["Operating expenses",summary.expenses]] : [["Payroll posted",summary.payroll]];
  const parties=report==="sales" ? forms.adapters.customer : report==="purchases" ? forms.adapters.supplier
    : report==="debts" ? [...forms.adapters.customer,...forms.adapters.supplier] : undefined;
  return <><Heading lang={lang} title="Reports">{forms.can("export")&&<ExportLink lang={lang} report={report} filters={filters}/>}</Heading>
    <div className="page-actions mb-3">{Object.entries(reports).map(([key,name])=><Link key={key} className={"button "+(key===report?"primary":"secondary")} href={"/reports?report="+key}>{tr(name)}</Link>)}</div>
    <Toolbar lang={lang} path="/reports" filters={filters} report={report} dateRange={report!=="stock"} party={parties}
      staff={report==="payroll"?forms.adapters.staff:undefined} category status={report==="stock"?["active","archived"]:undefined}/>
    {valuation&&<StockValues lang={lang} totals={valuation}/>}
    <div className="module-grid"><Info lang={lang} title="Financial summary" items={summaryItems.map(([title,value])=>[title,<Amt lang={lang} value={value}/>])}/>
    {cash!==null&&<Info lang={lang} title="Cash activity" items={[[report==="sales"?"Collected":"Paid out",<Amt lang={lang} value={cash}/>]]}/>}
    <Panel title={tr(reports[report])}>{report==="stock"?<Register lang={lang} stickyKey head={[partCodeLabel(lang),"Part","In stock","Cost","Price","Total cost","Total selling value"]} rows={stock.map((row)=>[
      <Ref href={"/inventory/"+row.id}>{row.code}</Ref>,row.name,String(row.onHand),<Amt lang={lang} value={row.cost}/>,
      <Amt lang={lang} value={row.price}/>,<Amt lang={lang} value={row.stockCost}/>,<Amt lang={lang} value={row.stockSellingValue}/>,
    ])}/>:<DocRegister lang={lang} docs={rows}/>}</Panel>
    {report==="sales"&&<Panel title={tr("Line items")}><Register lang={lang} head={["Number","Type","Description","Quantity","Total","Cost"]} rows={saleLines.map((line)=>[<Ref href={"/record/"+line.document.id}>{line.document.number}</Ref>,label(lang,line.kind),<bdi>{line.description}</bdi>,String(line.quantity),<Amt lang={lang} value={line.total}/>,<Amt lang={lang} value={line.costTotal}/>])}/></Panel>}
    </div><Pages lang={lang} path="/reports" filters={filters} report={report} count={Math.max(rows.length,stock.length)}/></>;
}
export async function SearchResults({lang,forms,query}:ModuleProps){
  const q=query.q?.trim().slice(0,100);
  const [people,cars,docs]=q?await Promise.all([parties("customer",{q}),vehicles({q}),documents(["job","appointment","invoice","purchase","credit","supplierCredit"],{q})]):[[],[],[]];
  return <><Heading lang={lang} title="Search results"/><Toolbar lang={lang} path="/search" filters={query}/>
    <div className="module-grid"><Panel title={translate(lang,"Customers")}><Register lang={lang} head={["Name","Phone"]} rows={people.map((row)=>[
      <Ref href={"/customers/"+row.id}>{row.name}</Ref>,<bdi>{row.phone}</bdi>,
    ])}/></Panel><Panel title={translate(lang,"Vehicles")}><Register lang={lang} head={["Vehicle","Plate","VIN"]} rows={cars.map((row)=>[
      <Ref href={"/vehicles/"+row.id}>{carName(row)}</Ref>,<bdi>{row.plate}</bdi>,<bdi>{row.vin}</bdi>,
    ])}/></Panel><Panel title={translate(lang,"Documents")}><DocRegister lang={lang} docs={docs} mode="jobs"/></Panel></div></>;
}

