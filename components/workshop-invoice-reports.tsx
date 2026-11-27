import Form from "next/form";
import { carName } from "@/lib/car-name";
import { db } from "@/lib/db";
import { invoicePaymentType } from "@/lib/invoice-settlement";
import { day, label, translate, type Language } from "@/lib/locale";
import { addDays, today } from "@/lib/rules";
import { parties } from "@/lib/views";
import { electricalReport, importReport } from "@/lib/workshop-invoice-reports";
import type { ModuleProps, Query } from "./modules";
import { Actions, Amt, Heading, Info, Pages, Ref, Register, Toolbar } from "./register";
import { ButtonLink, Panel } from "./ui";

function pageOffset(query: Query) {
  return Math.min(500, Math.max(0, Number.parseInt(query.page ?? "0", 10) || 0)) * 100;
}

function vehicleLink(vehicle: { id: string; make: string; model: string; color: string; plate: string } | null) {
  return vehicle && <Ref href={"/vehicles/" + vehicle.id}>{[carName(vehicle), vehicle.plate].filter(Boolean).join(" · ")}</Ref>;
}

function UnassignedCredits({ lang, amount }: { lang: Language; amount: bigint }) {
  return amount > 0n && <p className="notice">{translate(lang, "Invoice-wide credits without a line breakdown")} <Amt lang={lang} value={amount}/></p>;
}

export async function Imports({ lang, forms, query }: ModuleProps) {
  const t = (key: string) => translate(lang, key);
  const [report, vendors, supplierOptions] = await Promise.all([
    importReport(query), parties("supplier", { q: query.vendor }),
    db.party.findMany({ where: { kind: "supplier" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const offset = pageOffset(query);
  const rows = report.rows.slice(offset, offset + 100);
  const supplierRows = supplierOptions.filter(({ id }) => !query.party || id === query.party);
  const supplierLink = (id: string) => {
    const filters = new URLSearchParams({ party: id });
    for (const key of ["q", "from", "to", "vendor"] as const) if (query[key]) filters.set(key, query[key]);
    return "/imports?" + filters;
  };
  return <><Heading lang={lang} title="Imports">
    <Actions lang={lang} forms={forms} specs={[{ ...forms.party("supplier"), destination: "/imports" }]} auto={query.new}/>
  </Heading>
    <Toolbar lang={lang} path="/imports" filters={query} dateRange partyLabel="Supplier" party={supplierOptions.map(({ id, name }) => ({ value: id, name }))}/>
    <div className="detail-stack">
      <Info lang={lang} title="Import totals" items={[
        ["Recorded selling value", <Amt lang={lang} value={report.planned}/>], ["Net sales", <Amt lang={lang} value={report.revenue}/>],
        ["Buying cost of sold imports", <Amt lang={lang} value={report.cost}/>], ["Gross profit", <Amt lang={lang} value={report.profit}/>],
      ]}/>
      <UnassignedCredits lang={lang} amount={report.unassignedCredits}/>
      <Panel title={t("Import sales by supplier")}><Register lang={lang} head={[
        "Supplier", "Recorded selling value", "Net sales", "Buying cost of sold imports", "Gross profit",
      ]} rows={[
        ...supplierRows.map(({ id, name }) => ({ id, name })),
        ...(report.supplierTotals.has(null) ? [{ id: null, name: t("Unassigned supplier") }] : []),
      ].map(({ id, name }) => {
        const { planned, revenue, cost } = report.supplierTotals.get(id) ?? { planned: 0n, revenue: 0n, cost: 0n };
        return [id && !query.party ? <Ref href={supplierLink(id)}>{name}</Ref> : <bdi>{name}</bdi>,
          <Amt lang={lang} value={planned}/>, <Amt lang={lang} value={revenue}/>, <Amt lang={lang} value={cost}/>, <Amt lang={lang} value={revenue - cost}/>];
      })}/></Panel>
      <Panel title={t("Imported items")}><Register lang={lang} head={["Date", "Product name", "Quantity", "Buying price", "Selling price", "Net sales", "Supplier", "Work order", "Customer", "Vehicle", "Invoice", "Status"]} rows={rows.map((row) => [
        day(lang, row.at), <bdi>{row.name}</bdi>, <bdi>{row.quantity}</bdi>, <Amt lang={lang} value={row.buyingPrice}/>, <Amt lang={lang} value={row.price}/>,
        row.invoice ? <Amt lang={lang} value={row.revenue}/> : null, <bdi>{row.supplier}</bdi>,
        row.job && <Ref href={"/jobs/" + row.job.id}>{row.job.number}</Ref>,
        row.party && <Ref href={"/customers/" + row.party.id}>{row.party.name}</Ref>, vehicleLink(row.vehicle),
        row.invoice && <Ref href={"/record/" + row.invoice.id}>{row.invoice.number}</Ref>,
        row.status === "reversed" || row.status === "cancelled" ? label(lang, row.status) : t(row.status),
      ])}/></Panel>
      <Pages lang={lang} path="/imports" filters={query} count={rows.length}/>
      <Panel title={t("Suppliers")}>
        <Form action="/imports" className="toolbar" prefetch={false}>
          {Object.entries(query).filter(([key, value]) => key !== "vendor" && key !== "new" && value).map(([key, value]) => <input key={key} type="hidden" name={key} value={value}/>)}
          <input name="vendor" aria-label={t("Search suppliers")} placeholder={t("Search suppliers")} defaultValue={query.vendor}/>
          <button type="submit" className="button secondary">{t("Search")}</button>
        </Form>
        <Register lang={lang} head={["Name", "Phone", "Status", "Action"]} rows={vendors.map((vendor) => [
          <Ref href={"/purchasing/" + vendor.id}>{vendor.name}</Ref>, <bdi>{vendor.phone}</bdi>, t(vendor.archived ? "Archived" : "Open"),
          <Actions lang={lang} forms={forms} primary={false} specs={[{ ...forms.party("supplier", vendor), destination: "/imports" }]}/>,
        ])}/>
      </Panel>
    </div></>;
}

export async function ElectricalWork({ lang, forms, query }: ModuleProps) {
  const t = (key: string) => translate(lang, key);
  const path = "/electrical-work";
  const report = await electricalReport(query);
  const offset = pageOffset(query);
  const rows = report.rows.slice(offset, offset + 100);
  const now = today();
  const sunday = addDays(now, -new Date(now + "T12:00:00Z").getUTCDay());
  const period = (from: string) => path + "?" + new URLSearchParams({ q: query.q || "", party: query.party || "", vehicle: query.vehicle || "", from, to: now });
  return <><Heading lang={lang} title="Electrical work">
    <ButtonLink href={period(now)}>{t("Today")}</ButtonLink><ButtonLink href={period(sunday)}>{t("This week")}</ButtonLink>
  </Heading>
    <Toolbar lang={lang} path={path} filters={query} dateRange partyLabel="Customer" party={forms.adapters.customer} vehicle={forms.adapters.cars}/>
    <div className="detail-stack">
      <Info lang={lang} title="Electrical totals" items={[["Electrical work", <Amt lang={lang} value={report.work}/>],
        ["Electrical labor", <Amt lang={lang} value={report.labor}/>], ["Combined electrical charges", <Amt lang={lang} value={report.total}/>]]}/>
      <UnassignedCredits lang={lang} amount={report.unassignedCredits}/>
      <Panel title={t("Invoices")}><Register lang={lang} head={["Invoice", "Date", "Customer", "Vehicle", "Electrical work", "Electrical labor", "Work order", "Payment status"]} rows={rows.map(({ invoice, work, labor, settlement }) => [
        <Ref href={"/record/" + invoice.id}>{invoice.number}</Ref>, day(lang, invoice.at),
        invoice.party && <Ref href={"/customers/" + invoice.party.id}>{invoice.party.name}</Ref>, vehicleLink(invoice.vehicle),
        <Amt lang={lang} value={work}/>, <Amt lang={lang} value={labor}/>, invoice.source && <Ref href={"/jobs/" + invoice.source.id}>{invoice.source.number}</Ref>,
        settlement ? t(invoicePaymentType(settlement.balance, settlement.paid)) : label(lang, invoice.status),
      ])}/></Panel>
      <Pages lang={lang} path={path} filters={query} count={rows.length}/>
      {report.pending.length > 0 && <Panel title={t("Work orders awaiting invoice")}><Register lang={lang} head={["Work order", "Date", "Customer", "Vehicle", "Electrical work", "Electrical labor"]} rows={report.pending.slice(0, 100).map(({ job, work, labor }) => [
        <Ref href={"/jobs/" + job.id}>{job.number}</Ref>, day(lang, job.at), job.party && <Ref href={"/customers/" + job.party.id}>{job.party.name}</Ref>,
        vehicleLink(job.vehicle), <Amt lang={lang} value={work}/>, <Amt lang={lang} value={labor}/>,
      ])}/></Panel>}
    </div></>;
}
