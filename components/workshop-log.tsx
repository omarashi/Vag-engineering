import Link from "./navigation-link";
import Form from "next/form";
import { getImageProps } from "next/image";
import { ArrowRight, CalendarDays, CarFront, ClipboardList, Phone, Search, ShoppingCart, UserPlus, Wrench } from "lucide-react";
import { notFound } from "next/navigation";
import type { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { carName } from "@/lib/car-name";
import { day, money, translate, type Language } from "@/lib/locale";
import { serviceName, visitServiceTypes } from "@/lib/services";
import { recordedDeliveryDate, type visitById, visitList } from "@/lib/visits";
import { closedJobStatuses, openJobStatuses } from "@/lib/workshop";
import { customerDebtList } from "@/lib/customer-debt";
import { can } from "@/lib/permissions";
import { today } from "@/lib/rules";
import { carForm, customerChoices, customerDebtForm, customerForm, jobForm, jobProgressForm, receiptAccounts, receiverSuggestions, visitPartOptions } from "@/lib/visit-forms";
import { jobModeLabel, visitParts, visitTitle, visitWork, workshopIntake } from "@/lib/visit-items";
import { workshopPhotosOn } from "@/lib/workshop-photos";
import { workshopPhotoLimit } from "@/lib/workshop-photo-limits";
import { ActionForm } from "./action-form";
import { WorkshopMedia } from "./workshop-media";
import { CustomerDebt } from "./customer-debt";
import { CashAccountSetup, DocRegister, PrintLink } from "./register";
import { VisitBilling } from "./visit-billing";
import { VisitWorkList } from "./visit-work-list";
import { Badge, ButtonLink, Empty, Panel } from "./ui";

export type LogQuery = { q: string; action: string; page: number; continueVisit: boolean };
type Props = { lang: Language; query: LogQuery };
type Visit = Awaited<ReturnType<typeof visitList>>[number];
type Customer = { id: string; name: string; phone: string; _count: { vehicles: number } };
type Car = { id: string; make: string; model: string; color: string; plate: string; year?: number | null; party?: { name: string } };
const pageSize = 24;

function customerResults(q = "", page = 0, take = pageSize) {
  const like = { contains: q, mode: "insensitive" as const };
  return db.party.findMany({
    where: { kind: "customer", archived: false, ...(q ? { OR: [
      { name: like }, { phone: like }, { vehicles: { some: { plate: like } } },
    ] } : {}) },
    select: { id: true, name: true, phone: true, _count: { select: { vehicles: { where: { archived: false } } } } },
    orderBy: q ? [{ name: "asc" }, { id: "asc" }] : [{ createdAt: "desc" }, { id: "desc" }],
    skip: page * take, take,
  });
}

function carResults(q = "", page = 0, take = pageSize) {
  const like = { contains: q, mode: "insensitive" as const };
  return db.vehicle.findMany({
    where: { archived: false, ...(q ? { OR: [
      { model: like }, { make: like }, { color: like }, { plate: like }, { party: { OR: [{ name: like }, { phone: like }] } },
    ] } : {}) },
    select: { id: true, make: true, model: true, color: true, plate: true, year: true, party: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: page * take, take,
  });
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((piece) => piece[0]).join("").toUpperCase();
}

function Title({ lang, title, detail, children, literal = false }: {
  lang: Language; title: string; detail?: string; children?: React.ReactNode; literal?: boolean;
}) {
  return <header className="log-title">
    <div><h1><bdi>{literal ? title : translate(lang, title)}</bdi></h1>{detail && <p>{detail}</p>}</div>
    {children && <div className="log-actions">{children}</div>}
  </header>;
}

function SearchBox({ lang, route, query, placeholder = "Search by name, phone or plate" }: {
  lang: Language; route: string; query: LogQuery; placeholder?: string;
}) {
  const t = (text: string) => translate(lang, text);
  return <Form key={query.q} className="log-filters" action={route} prefetch={false}>
    <div className="log-search"><Search size={18}/><input name="q" aria-label={t("Search")} defaultValue={query.q} maxLength={100}
      placeholder={t(placeholder)}/></div>
    <button className="button secondary" type="submit">{t("Search")}</button>
    {query.q && <Link href={route} className="button ghost">{t("Clear")}</Link>}
  </Form>;
}

function Pagination({ lang, route, query, count, hasNext = count === pageSize }: {
  lang: Language; route: string; query: LogQuery; count: number; hasNext?: boolean;
}) {
  const pathname = (page: number) => {
    const [base, search] = route.split("?");
    const params = new URLSearchParams(search);
    params.set("page", String(page));
    if (query.q) params.set("q", query.q);
    return base + "?" + params;
  };
  if (query.page === 0 && !hasNext) return null;
  return <div className="log-actions log-pagination">
    {query.page > 0 && <ButtonLink href={pathname(query.page - 1)}>{translate(lang, "Previous page")}</ButtonLink>}
    {hasNext && <ButtonLink href={pathname(query.page + 1)}>{translate(lang, "Next page")}</ButtonLink>}
  </div>;
}

function CustomerRows({ lang, rows }: { lang: Language; rows: Customer[] }) {
  if (!rows.length) return <Empty lang={lang} text="No customers found"/>;
  return <ul className="log-list">{rows.map((row) => <li key={row.id}>
    <Link className="log-list-link" href={"/customers/" + row.id}>
      <span className="log-list-icon person"><bdi>{initials(row.name)}</bdi></span>
      <span className="log-row-main"><strong><bdi>{row.name}</bdi></strong>
        <small>{row.phone ? <bdi>{row.phone}</bdi> : translate(lang, "No phone number")}</small></span>
      <span className="log-row-extra">{new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en").format(row._count.vehicles)} <CarFront size={16}/></span>
      <ArrowRight className="log-direction" size={17}/>
    </Link>
  </li>)}</ul>;
}

function CarRows({ lang, rows }: { lang: Language; rows: Car[] }) {
  if (!rows.length) return <Empty lang={lang} text="No cars found"/>;
  return <ul className="log-list">{rows.map((row) => <li key={row.id}>
    <Link className="log-list-link" href={"/vehicles/" + row.id}>
      <span className="log-list-icon car"><CarFront size={19}/></span>
      <span className="log-row-main"><strong><bdi>{carName(row)}</bdi></strong>
        <small><bdi>{[row.plate, row.party?.name, row.year].filter(Boolean).join(" · ") || translate(lang, "No plate number")}</bdi></small>
      </span>
      <ArrowRight className="log-direction" size={17}/>
    </Link>
  </li>)}</ul>;
}

function VisitRows({ lang, rows, scope = "all" }: { lang: Language; rows: Visit[]; scope?: "all" | "customer" | "car" }) {
  if (!rows.length) return <Empty lang={lang} text="No jobs found"/>;
  return <ul className="log-list">{rows.map((row) => {
    const related = [scope === "all" ? row.party?.name : "", scope !== "car" && row.vehicle ? carName(row.vehicle) : ""].filter(Boolean).join(" · ");
    const services = visitServiceTypes(row);
    return <li key={row.id}><Link className="log-list-link log-visit-link" href={"/jobs/" + row.id}>
      <span className="log-list-icon visit"><Wrench size={18}/></span>
      <span className="log-row-main">
        <strong><bdi>{visitTitle(lang, row)}</bdi></strong>
        {related && <small><bdi>{related}</bdi></small>}
        {services.length > 0 && <span className="log-service-tags">{services.map((service) => <span className="log-service" key={service}>{serviceName(lang, service)}</span>)}</span>}
      </span>
      <span className="log-visit-stamp"><time dateTime={row.at.toISOString()}>{day(lang, row.at)}</time></span>
      <ArrowRight className="log-direction" size={17}/>
    </Link></li>;
  })}</ul>;
}

function Details({ lang, items }: { lang: Language; items: [string, React.ReactNode][] }) {
  const shown = items.filter(([, value]) => value != null && value !== "");
  if (!shown.length) return null;
  return <dl className="log-details panel">
    {shown.map(([key, value]) => <div key={key}><dt>{translate(lang, key)}</dt><dd>{typeof value === "string" ? <bdi>{value}</bdi> : value}</dd></div>)}
  </dl>;
}

export async function Home({ lang, role }: { lang: Language; role: Role }) {
  const mayViewDebts = can(role, "customerDebtPayment");
  const queueOptions = {
    take: 6, orderBy: [{ at: "asc" }, { number: "asc" }],
    include: { party: { select: { name: true } }, vehicle: { select: { make: true, model: true, color: true, plate: true } } },
  } satisfies Prisma.DocumentFindManyArgs;
  const [counts, queue, balances] = await Promise.all([
    db.document.groupBy({ by: ["status"], where: { kind: "job", status: { in: openJobStatuses } }, _count: true }),
    db.document.findMany({ ...queueOptions, where: { kind: "job", status: { in: openJobStatuses } } }),
    mayViewDebts ? customerDebtList(db, "", 0, 5, "balance") : [],
  ]);
  const byStatus = new Map(counts.map((row) => [row.status, row._count]));
  const open = counts.reduce((sum, row) => sum + row._count, 0);
  const t = (key: string) => translate(lang, key);
  const stats = [
    [open, "Open jobs", "/jobs", ClipboardList, "person"],
    [byStatus.get("inProgress") ?? 0, "In progress", "/jobs?status=inProgress", CarFront, "car"],
  ] as const;
  const countFormat = new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en");
  const date = new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", {
    weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Cairo",
  }).format(new Date());
  const alt = t("VAG Engineering workshop illustration");
  const { props: desktopBanner } = getImageProps({
    src: "/desktop%20version.jpg", width: 2192, height: 480, alt,
    sizes: "(max-width: 850px) calc(100vw - 26px), (max-width: 1100px) calc(100vw - 223px), (max-width: 1668px) calc(100vw - 276px), 1392px",
    loading: "eager", fetchPriority: "high",
  });
  const { props: phoneBanner } = getImageProps({
    src: "/phone%20version.jpg", width: 1664, height: 640, alt, sizes: "calc(100vw - 26px)",
  });
  return <>
    <section className="log-hero">
      <picture>
        <source media="(max-width: 590px)" srcSet={phoneBanner.srcSet} sizes={phoneBanner.sizes}
          width={phoneBanner.width} height={phoneBanner.height}/>
        <img className="log-hero-photo" {...desktopBanner}/>
      </picture>
      <div className="log-hero-copy">
        <div>
          <span className="log-hero-date"><CalendarDays size={15} aria-hidden="true"/>{date}</span>
          <h1>{t("Workshop log")}</h1>
        </div>
        <div className="log-actions">
          <ButtonLink href="/jobs?new=job" primary><ClipboardList size={17}/>{t("New job")}</ButtonLink>
          {can(role, "invoice") && <ButtonLink href="/counter-sale"><ShoppingCart size={17}/>{t("Counter sale")}</ButtonLink>}
          <ButtonLink href="/customers?new=customer"><UserPlus size={17}/>{t("Add customer")}</ButtonLink>
        </div>
      </div>
    </section>
    <section className="log-stats" aria-label={t("Workshop totals")}>
      {stats.map(([count, title, href, Icon, tone]) => <Link href={href} className="log-stat panel" key={href}>
        <span className={"log-list-icon " + tone}><Icon size={20}/></span>
        <div><strong>{countFormat.format(count)}</strong><span>{t(title)}</span></div><ArrowRight size={17} className="log-direction"/>
      </Link>)}
    </section>
    <div className={mayViewDebts ? "log-columns" : "log-stack"}>
      <Panel title={t("Workshop queue")} link="/jobs" linkLabel={t("View all jobs")}>
        {queue.length ? <DocRegister lang={lang} docs={queue} mode="jobs"/> : <Empty lang={lang} text="No open jobs"/>}
      </Panel>
      {mayViewDebts && <Panel title={t("Outstanding customer balances")} link="/debts" linkLabel={t("View all")}>
        {balances.length ? <ul className="log-list">{balances.map((row) => <li key={row.id}>
          <Link className="log-list-link" href={"/customers/" + row.id + "#customer-balance"}>
            <span className="log-row-main">
              <strong><bdi>{row.name}</bdi></strong>
              {(row.phone || row.archived) && <small><bdi>{[row.phone, row.archived ? t("Archived") : ""].filter(Boolean).join(" · ")}</bdi></small>}
            </span>
            <strong className="log-balance-value"><bdi>{money(lang, row.balance)}</bdi></strong>
          </Link>
        </li>)}</ul> : <Empty lang={lang} text="No customers owe money"/>}
      </Panel>}
    </div>
  </>;
}

export async function CustomerList({ lang, query }: Props) {
  const rows = await customerResults(query.q, query.page);
  return <><Title lang={lang} title="Customers"><ActionForm lang={lang} spec={customerForm(undefined, query.continueVisit)} primary auto={query.action === "customer"}/></Title>
    <SearchBox lang={lang} route="/customers" query={query}/>
    <div className="panel"><CustomerRows lang={lang} rows={rows}/></div>
    <Pagination lang={lang} route="/customers" query={query} count={rows.length}/></>;
}

export async function Debts({ lang, query, role, receipt }: Props & { role: Role; receipt: string }) {
  const mayPay = can(role, "customerDebtPayment");
  const [balances, accounts] = await Promise.all([
    customerDebtList(db, query.q, query.page * pageSize, pageSize + 1),
    mayPay ? receiptAccounts() : [],
  ]);
  const t = (key: string) => translate(lang, key);
  const rows = balances.slice(0, pageSize);
  const search = new URLSearchParams();
  if (query.q) search.set("q", query.q);
  if (query.page) search.set("page", String(query.page));
  const destination = "/debts?" + (search.size ? search.toString() + "&" : "") + "receipt=$id";
  const needsAccount = mayPay && !accounts.length && rows.some((row) => !row.archived);

  return <>
    <Title lang={lang} title="Customer debts">
      {needsAccount && <CashAccountSetup lang={lang} canManage={can(role,"account")}/>}
    </Title>
    {/^[a-z0-9_-]+$/i.test(receipt) && <p className="notice log-saved debt-payment-notice" role="status">
      {t("Payment recorded")} <Link href={"/payment/" + receipt}>{t("View receipt")}</Link>
    </p>}
    <SearchBox lang={lang} route="/debts" query={query} placeholder="Search by customer name or phone"/>
    <div className="panel">
      {rows.length ? <ul className="log-list" aria-label={t("Customer debts")}>{rows.map((row) => <li key={row.id} className="debtor-row">
        <div className="log-row-main">
          <strong><Link href={"/customers/" + row.id + "#customer-balance"}><bdi>{row.name}</bdi></Link></strong>
          {(row.phone || row.archived) && <small><bdi>{[row.phone, row.archived ? t("Archived") : ""].filter(Boolean).join(" · ")}</bdi></small>}
        </div>
        <div className="debtor-balance">
          <small>{t("Outstanding balance")}</small>
          <strong><bdi>{money(lang, row.balance)}</bdi></strong>
        </div>
        {mayPay && !row.archived && accounts.length > 0 && <ActionForm lang={lang} spec={customerDebtForm(lang, row.id, row.balance, accounts, {
          name: row.name, destination,
        })}/>}
      </li>)}</ul> : <Empty lang={lang} text={query.q ? "No matching customers with a balance" : "No customers owe money"}/>}
    </div>
    <Pagination lang={lang} route="/debts" query={query} count={rows.length} hasNext={balances.length > pageSize}/>
  </>;
}

export async function CustomerPage({ lang, query, id, role }: Props & { id: string; role: Role }) {
  const [person, visits] = await Promise.all([
    db.party.findFirst({ where: { id, kind: "customer" }, include: { vehicles: { where: { archived: false }, orderBy: { createdAt: "desc" } } } }),
    visitList({ partyId: id, take: 6 }),
  ]);
  if (!person) notFound();
  const mayViewBilling = can(role, "payment");
  const specs = { customerId: id, customers: [], continueVisit: query.continueVisit };
  const t = (key: string) => translate(lang, key);
  return <><Link className="log-back" href="/customers">{t("Back to customers")}</Link>
    <Title lang={lang} title={person.name} literal>
      {mayViewBilling && <ButtonLink href={"/receipts?party=" + id}>{t("Receipts")}</ButtonLink>}
      {!person.archived && <ActionForm lang={lang} spec={carForm(specs)} primary auto={query.action === "vehicle"}/>}
      <ActionForm lang={lang} spec={customerForm(person)}/>
    </Title>
    <div className="log-stack">
      <Details lang={lang} items={[
        ["Mobile number", person.phone ? <a className="log-phone" href={"tel:" + person.phone.replace(/[^\d+٠-٩]/g, "")}><Phone size={15}/><bdi>{person.phone}</bdi></a> : null],
        ["Notes", person.note], ["Other contact", person.contact], ["Address", person.address], ["Status", person.archived ? t("Archived") : ""],
      ]}/>
      {mayViewBilling && <CustomerDebt lang={lang} partyId={id} role={role} archived={person.archived}/>}
      <Panel title={t("Customer’s cars")}><CarRows lang={lang} rows={person.vehicles}/></Panel>
      <Panel title={t("Recent jobs")} link={"/jobs?party=" + id} linkLabel={t("View all")}><VisitRows lang={lang} rows={visits} scope="customer"/></Panel>
    </div>
  </>;
}

export async function CarList({ lang, query }: Props) {
  const [rows, customers] = await Promise.all([carResults(query.q, query.page), customerChoices()]);
  return <><Title lang={lang} title="Cars">
    {customers.length ? <ActionForm lang={lang} spec={carForm({ customers })} primary auto={query.action === "vehicle"}/> :
      <ButtonLink href="/customers?new=customer" primary><UserPlus size={17}/>{translate(lang, "Add customer")}</ButtonLink>}
    </Title>
    <SearchBox lang={lang} route="/vehicles" query={query} placeholder="Search by model, color or plate"/>
    <div className="panel"><CarRows lang={lang} rows={rows}/></div>
    <Pagination lang={lang} route="/vehicles" query={query} count={rows.length}/></>;
}

export async function CarPage({ lang, query, id, role }: Props & { id: string; role: Role }) {
  const [car, visits, partOptions, receivers, photosEnabled] = await Promise.all([
    db.vehicle.findUnique({ where: { id }, include: { party: true } }),
    visitList({ vehicleId: id, page: query.page }),
    visitPartOptions(lang),
    receiverSuggestions(),
    workshopPhotosOn(),
  ]);
  if (!car) notFound();
  const t = (key: string) => translate(lang, key);
  return <><Link href={"/customers/" + car.partyId} className="log-back">{t("Back to customer")} · <bdi>{car.party.name}</bdi></Link>
    <section className="log-car-hero">
      <div><h1><bdi>{carName(car)}</bdi></h1>{car.plate && <span className="log-plate"><bdi>{car.plate}</bdi></span>}
        <div className="log-actions">
          {!car.archived && !car.party.archived && <ActionForm lang={lang} spec={jobForm(lang, {
            customerId: car.partyId, carId: id, partOptions, receivers, mayTakePayment: can(role, "visitReceipt"), photosEnabled,
          })} primary auto={["job", "visit"].includes(query.action)}/>}
          <ActionForm lang={lang} spec={carForm({ row: car, customers: [] })}/>
        </div>
      </div>
    </section>
    <div className="log-stack">
      <Details lang={lang} items={[
        ["Customer", <Link href={"/customers/" + car.partyId}><bdi>{car.party.name}</bdi></Link>],
        ["Model year", car.year], ["Odometer (km)", car.mileage], ["Tuning stage", car.stage], ["Notes", car.note],
        ["VIN", car.vin], ["Engine code", car.engine], ["Transmission", car.transmission],
      ]}/>
      <Panel title={t("Service history")}><VisitRows lang={lang} rows={visits} scope="car"/></Panel>
      <Pagination lang={lang} route={"/vehicles/" + id} query={query} count={visits.length}/>
    </div>
  </>;
}

export async function ServiceJobPage({ lang, row, role, autoReceipt }: { lang: Language; row: NonNullable<Awaited<ReturnType<typeof visitById>>>; role: Role; autoReceipt: boolean }) {
  const id = row.id;
  const t = (key: string) => translate(lang, key);
  const metadata = row.metadata as { mileage?: number; requested?: string; work?: string; inspection?: string };
  const intake = workshopIntake(row.metadata);
  const work = visitWork(row);
  const parts = visitParts(row.metadata);
  const closed = closedJobStatuses.includes(row.status);
  const editable = row.status !== "cancelled";
  const mayTakePayment = can(role, "visitReceipt");
  const [partOptions, receivers, photosEnabled] = await Promise.all([
    editable && !row.related.length ? visitPartOptions(lang) : undefined,
    intake && editable ? receiverSuggestions() : undefined,
    workshopPhotosOn(),
  ]);
  const photoSlots = photosEnabled ? Math.max(0, workshopPhotoLimit - row.attachments.filter(({ mime }) => mime.startsWith("image/")).length) : undefined;
  const canProgress = intake?.jobMode === "stay" && !closed;
  const deliveryDate = recordedDeliveryDate(row);
  const finished = row.kind === "visit" || row.status === "delivered";
  return <><Link className="log-back" href={closed ? "/jobs/history" : "/jobs"}>{t("Back to jobs")}</Link>
    <Title lang={lang} title={visitTitle(lang, row)} literal detail={row.number}>
      {canProgress && <ActionForm lang={lang} spec={jobProgressForm(row, mayTakePayment, photoSlots)} primary/>}
      {editable && <ActionForm lang={lang} spec={jobForm(lang, { row, partOptions, receivers, mayTakePayment })} primary={!canProgress}/>}
      {intake && mayTakePayment && <PrintLink lang={lang} type="record" id={id}/>}
    </Title>
    <div className="log-stack"><Details lang={lang} items={[
      ["Customer", row.party && <Link href={"/customers/" + row.party.id}><bdi>{row.party.name}</bdi></Link>],
      ["Car", row.vehicle && <Link href={"/vehicles/" + row.vehicle.id}><bdi>{[carName(row.vehicle), row.vehicle.plate].filter(Boolean).join(" · ")}</bdi></Link>],
      ["Job type", intake && t(jobModeLabel(intake.jobMode))],
      ["Status", row.status === "new" ? t("Checked in") : <Badge lang={lang} value={row.status}/>],
      ["Received by", intake?.receivedBy],
      ["Date received", day(lang, row.at)],
      ["Delivery date", deliveryDate ? day(lang, deliveryDate) : null],
      ["Odometer (km)", metadata.mileage],
      ["Notes", row.note], ["Work notes", metadata.work], ["Inspection", metadata.inspection], ["Requested work", metadata.requested],
    ]}/>
    {mayTakePayment && (finished || row.related.length > 0) && editable && <VisitBilling lang={lang} id={id} role={role} work={work} parts={parts}
      version={row.version} autoReceipt={autoReceipt} serviceDay={deliveryDate || today(row.at)}/>}
    {work.length > 0 && <Panel title={t(finished ? "Work done" : "Selected services")}><VisitWorkList lang={lang} work={work}/></Panel>}
    {parts.length > 0 && <Panel title={t("Parts used")}><ul className="visit-work-list">{parts.map((part) => <li key={part.partId}>
      <strong><bdi>{part.code + " · " + part.name}</bdi></strong>
      <p><bdi>{mayTakePayment ? part.quantity + " × " + money(lang, part.unitPrice) : part.quantity}</bdi></p>
    </li>)}</ul></Panel>}
    <WorkshopMedia lang={lang} id={id} files={row.attachments} allowPhotos={editable} photosEnabled={photosEnabled}
      allowAttachments={editable && (row.kind === "job" || role !== "technician")} showAttachments={Boolean(intake)}/>
    </div>
  </>;
}

export async function LogSearch({ lang, query }: Props) {
  const [people, cars, visits] = query.q ? await Promise.all([
    customerResults(query.q, 0, 8), carResults(query.q, 0, 8), visitList({ q: query.q, take: 8 }),
  ]) : [[], [], []];
  const t = (key: string) => translate(lang, key);
  return <><Title lang={lang} title="Search results"/>
    <SearchBox lang={lang} route="/search" query={query}/>
    <div className="log-stack">
      <Panel title={t("Customers")} link={"/customers?q=" + encodeURIComponent(query.q)} linkLabel={t("View all")}><CustomerRows lang={lang} rows={people}/></Panel>
      <Panel title={t("Cars")} link={"/vehicles?q=" + encodeURIComponent(query.q)} linkLabel={t("View all")}><CarRows lang={lang} rows={cars}/></Panel>
      <Panel title={t("Jobs")} link={"/jobs?q=" + encodeURIComponent(query.q)} linkLabel={t("View all")}><VisitRows lang={lang} rows={visits}/></Panel>
    </div>
  </>;
}

