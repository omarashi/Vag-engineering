import { CarFront, ChartNoAxesCombined, FileText, History, Landmark, Package, Receipt, Settings2, Truck, UsersRound, Wallet, Zap } from "lucide-react";
import Link from "./navigation-link";
import { notFound, redirect } from "next/navigation";
import type { Actor } from "@/lib/transaction";
import type { Role } from "@prisma/client";
import { forms } from "@/lib/forms";
import { overview, payments, selections } from "@/lib/views";
import { translate, type Language } from "@/lib/locale";
import { visitById } from "@/lib/visits";
import { workshopIntake } from "@/lib/visit-items";
import { Dashboard } from "./dashboard";
import { Audit, Balances, Cash, CashTransactions, Inventory, Invoices, Opening, Purchasing, Reports, Settings, Workshop, type Query } from "./modules";
import { PartView, PartyView, PaymentView, RecordView } from "./records";
import { EmployeeView, Payroll } from "./payroll";
import { Actions, Heading, Pages, PayRegister, Toolbar } from "./register";
import { ButtonLink, Panel } from "./ui";
import { ServiceJobPage } from "./workshop-log";
import { CounterSaleForm } from "./counter-sale";
import { SupplierPriceList } from "./supplier-price-list";
import { activeCustomers, visitPartOptions } from "@/lib/visit-forms";
import { can, canViewPage } from "@/lib/permissions";
import { today } from "@/lib/rules";
import { ElectricalWork, Imports } from "./workshop-invoice-reports";
import { RefundReceipt, Refunds } from "./refunds";

const sections = [
  { title: "Workshop and sales", tools: [
    ["invoices", "Invoices", FileText],
    ["receipts", "Receipts", Receipt], ["vehicles", "Cars", CarFront], ["inventory", "Inventory", Package], ["purchasing", "Suppliers & purchasing", Truck],
    ["imports", "Imports", Truck], ["electrical-work", "Electrical work", Zap], ["refunds", "Refund / Return", Receipt],
  ] },
  { title: "Money and people", tools: [
    ["balances", "Balances & credits", Landmark], ["cash", "Cash & expenses", Wallet], ["payroll", "Employees & payroll", UsersRound],
    ["business", "Business overview", ChartNoAxesCombined], ["reports", "Reports", FileText],
  ] },
  { title: "Administration", tools: [
    ["opening", "Opening balances", Landmark], ["audit", "Audit history", History], ["settings", "Settings", Settings2],
  ] },
] as const;

const routes = new Set<string>([...sections.flatMap(({ tools }) => tools.map(([path]) => path)), "jobs", "record", "payment"]);

function More({ lang, role }: { lang: Language; role: Role }) {
  const t = (key: string) => translate(lang, key);
  const visibleSections = sections.map(({ title, tools }) => ({ title, tools: tools.filter(([path]) => canViewPage(role, path)) }));
  return <><Heading lang={lang} title="More tools"/>
    <div className="log-stack">{visibleSections.filter(({ tools }) => tools.length > 0).map(({ title, tools }) => <Panel key={title} title={t(title)}>
      <div className="office-links">{tools.map(([path, name, Icon]) => <Link className="office-link" key={path} href={"/" + path}>
        <Icon size={20}/><span>{t(name)}</span>
      </Link>)}</div>
    </Panel>)}</div>
  </>;
}

async function Receipts({ lang, forms: actions, query }: { lang: Language; forms: ReturnType<typeof forms>; query: Query }) {
  const rows = await payments({ ...query, paymentKind: "receipt" });
  return <><Heading lang={lang} title="Receipts">
    <ButtonLink href="/invoices">{translate(lang, "Invoices")}</ButtonLink>
    <Actions lang={lang} forms={actions} specs={[actions.receipt()]} auto={query.new}/>
  </Heading>
    <Toolbar lang={lang} path="/receipts" filters={query} dateRange party={actions.adapters.customer}/>
    <Panel title={translate(lang, "Customer receipts")}><PayRegister lang={lang} rows={rows}/></Panel>
    <Pages lang={lang} path="/receipts" filters={query} count={rows.length}/>
  </>;
}

export async function OfficePage({ lang, route, id, actor, query }: { lang: Language; route: string; id?: string; actor: Actor; query: Query }) {
  if (route === "more" && !id) return <More lang={lang} role={actor.role}/>;
  if(route==="refunds")return id?<RefundReceipt lang={lang} id={id}/>:<Refunds lang={lang} partyId={query.party} invoiceId={query.invoice}/>;
  if (route === "counter-sale" && !id && can(actor.role, "invoice")) {
    const [customers, parts] = await Promise.all([activeCustomers(), visitPartOptions(lang)]);
    return <><Heading lang={lang} title="Counter sale"><ButtonLink href="/invoices">{translate(lang, "Invoices")}</ButtonLink></Heading>
      <CounterSaleForm lang={lang} customers={customers} options={parts} date={today()}/></>;
  }
  if (!routes.has(route)) notFound();
  if (id === "price-list" && (route === "inventory" || route === "purchasing")) {
    if (!can(actor.role, route === "inventory" ? "supplierStock" : "purchase")) notFound();
    return <SupplierPriceList lang={lang} search={query.q} fromInventory={route === "inventory"} canEdit={can(actor.role, "supplierQuote")}/>;
  }
  if (route === "cash" && id === "transactions") return <CashTransactions lang={lang} query={query} role={actor.role}/>;
  if (route === "reports" && !id && query.report === "payments") {
    const filters = new URLSearchParams();
    for (const key of ["q", "from", "to", "party", "staff", "page", "paymentKind"] as const) {
      const value = query[key];
      if (value) filters.set(key, value);
    }
    redirect("/cash/transactions" + (filters.size ? "?" + filters : ""));
  }
  if (route === "invoices" && !id && query.new === "payment") redirect("/balances?new=payment");
  if (route === "cash" && !id && query.new === "account") {
    if (!can(actor.role, "account")) notFound();
    redirect("/settings?new=account");
  }
  if (route === "business" && !id) return <Dashboard lang={lang} data={await overview()}/>;
  if (route === "jobs") {
    if (id === "billing" && !can(actor.role, "visitReceipt")) notFound();
    if (!id || id === "history" || id === "billing") return <Workshop lang={lang} query={query} role={actor.role} view={id === "billing" ? "billing" : id === "history" ? "history" : "open"}/>;
    const row = await visitById(id);
    if (!row) notFound();
    if (row.kind === "visit" || workshopIntake(row.metadata)) return <ServiceJobPage lang={lang} row={row} role={actor.role} autoReceipt={query.new === "receipt"}/>;
    return <RecordView lang={lang} forms={forms(lang, await selections(), actor)} id={id} query={query}/>;
  }
  if (route === "record" && !can(actor.role, "payment")) {
    const job = id && await visitById(id);
    if (!job) notFound();
    redirect("/jobs/" + job.id);
  }
  const props = { lang, forms: forms(lang, await selections(), actor), query };
  if (id) {
    const detail = { ...props, id };
    switch (route) {
      case "inventory": return <PartView {...detail}/>;
      case "purchasing": return <PartyView {...detail} kind="supplier"/>;
      case "payroll": return <EmployeeView {...detail}/>;
      case "record": return <RecordView {...detail}/>;
      case "payment": return <PaymentView {...detail}/>;
      default: notFound();
    }
  }
  switch (route) {
    case "receipts": return <Receipts {...props}/>;
    case "invoices": return <Invoices {...props}/>;
    case "inventory": return <Inventory {...props}/>;
    case "purchasing": return <Purchasing {...props}/>;
    case "imports": return <Imports {...props}/>;
    case "electrical-work": return <ElectricalWork {...props}/>;
    case "balances": return <Balances {...props}/>;
    case "cash": return <Cash {...props}/>;
    case "payroll": return <Payroll {...props}/>;
    case "reports": return <Reports {...props}/>;
    case "opening": return <Opening {...props}/>;
    case "settings": return <Settings {...props}/>;
    case "audit": return <Audit {...props}/>;
    default: notFound();
  }
}

