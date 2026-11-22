import Form from "next/form";
import { notFound } from "next/navigation";
import type { Document, Employee } from "@prisma/client";
import { db, plain } from "@/lib/db";
import { day, label, money, translate, type Language } from "@/lib/locale";
import { absenceDate, employedOn, employeeWeekEnding, nextAdjustmentWeek, pendingAbsencesForWeek, selectedWeekEnding, weekStarting, weeklyRecord, workedDuringWeek } from "@/lib/payroll";
import { today } from "@/lib/rules";
import { documents, payments } from "@/lib/views";
import { AbsenceToggle } from "./absence-toggle";
import { ActionForm, type ActionSpec, type Option } from "./action-form";
import type { ModuleProps } from "./modules";
import { Actions, Amt, DocRegister, Heading, Info, Pages, PayRegister, Ref, Register, Toolbar } from "./register";
import { Badge, Button, ButtonLink, Empty, Panel } from "./ui";

type PayrollAction = "salaryPayment" | "advance" | "deduction";
type PayWeek = { week: string; period: Document | null; remaining: bigint; pendingAbsence: boolean };

const actionTitles: Record<PayrollAction, string> = {
  salaryPayment: "Pay weekly salary",
  advance: "Record cash advance",
  deduction: "Deduct salary",
};

function payrollForm({ kind, employee, selected, target, accounts, lang }: {
  kind: PayrollAction; employee: Employee; selected: PayWeek; target: PayWeek;
  accounts: Option[]; lang: Language;
}): ActionSpec {
  const date = today();
  const deduction = kind === "deduction";
  const { week, period, remaining, pendingAbsence } = target;
  const forwarded = week !== selected.week;
  const showWeek = forwarded || (!period && kind !== "salaryPayment");
  return {
    action: "weeklyPayroll", title: actionTitles[kind],
    submitLabel: kind === "salaryPayment" ? "Record salary payment" : deduction ? "Save deduction" : "Save advance",
    destination: "/payroll/" + employee.id + "?week=" + week,
    hidden: { employeeId: employee.id, weekEnding: selected.week, kind, periodId: selected.period?.id ?? "",
      ...(selected.period ? { version: selected.period.version, expectedBalance: String(selected.remaining) } : {}),
      ...(!period ? { expectedWeeklySalary: String(employee.weeklySalary) } : {}),
      targetWeek: week, targetPeriodId: period?.id ?? "",
    },
    formSummary: {
      name: employee.name,
      label: forwarded ? "Next unpaid week ending" : showWeek ? "Week ending" : period ? "Remaining salary" : "Weekly salary",
      amount: showWeek ? day(lang, absenceDate(week)) : money(lang, period ? remaining : employee.weeklySalary ?? 0n),
      note: pendingAbsence ? "Pending absence deductions apply before payment." : undefined,
    },
    fields: [
      ...(kind !== "salaryPayment" ? [{
        key: "amount", label: "Amount (EGP)", required: true, wide: true, ltr: true, inputMode: "decimal" as const,
      }] : []),
      ...(!deduction ? [
        { key: "accountId", label: "Paid from", type: "select" as const, value: accounts.length === 1 ? accounts[0].value : "", options: accounts, required: true },
        { key: "method", label: "Payment method", type: "select" as const, value: "cash", required: true,
          options: ["cash","transfer"].map(value => ({ value, name: label(lang, value) })) },
      ] : []),
      { key: "at", label: "Date", type: "date", value: date, min: today(employee.startedAt), max: date, required: true, ltr: true },
      { key: "note", label: deduction ? "Reason" : "Notes", type: "textarea", wide: true, required: deduction },
    ],
  };
}

export async function Payroll({ lang, forms, query }: ModuleProps) {
  const date = today();
  const [people, periods, pays] = await Promise.all([
    db.employee.findMany({
      where: { id: query.staff || undefined, ...(query.q ? {name:{contains:query.q.slice(0,100),mode:"insensitive"}} : {}) },
      include: { absences: { where: { day: absenceDate(date), voidedAt: null }, select: { id: true } } },
      take: 100, orderBy: [{ archived: "asc" }, { name: "asc" }],
    }),
    documents(["payroll","employeeOpening","advanceOpening"], query), payments(query, undefined, ["advance","salaryPayment"]),
  ]);
  const t = (key: string) => translate(lang, key);
  return <><Heading lang={lang} title="Employees & payroll"><Actions lang={lang} forms={forms} specs={[forms.employee()]} auto={query.new}/></Heading>
    <Toolbar lang={lang} path="/payroll" filters={query} dateRange staff={forms.adapters.staff}/>
    <div className="detail-stack">
      <Panel title={t("Select employee")}>
        {people.length ? <ul className="log-list">{people.map(row => {
          const active = employedOn(row, date);
          const absent = row.absences.length > 0;
          const status = active ? absent ? "Absent today" : "Active" : row.dismissalReason ? "Dismissed" : "Inactive";
          return <li key={row.id} className="payroll-staff-row">
            <div className="log-row-main">
              <strong><Ref href={"/payroll/"+row.id}>{row.name}</Ref></strong>
              <small>{t(status)}{row.weeklySalary !== null && <> · {t("Weekly salary")} <Amt lang={lang} value={row.weeklySalary}/></>}</small>
            </div>
            {active && forms.can("employeeAbsence") && <AbsenceToggle employeeId={row.id} absent={absent} lang={lang}/>}
          </li>;
        })}</ul> : <Empty lang={lang}/>}
      </Panel>
      <div className="module-grid">
        <Panel title={t("Pay periods")}><DocRegister lang={lang} docs={periods}/></Panel>
        <Panel title={t("Payments")}><PayRegister lang={lang} rows={pays}/></Panel>
      </div>
    </div>
    <Pages lang={lang} path="/payroll" filters={query} count={Math.max(periods.length,pays.length)}/>
  </>;
}

export async function EmployeeView({ lang, forms, id, query }: ModuleProps & { id: string }) {
  const date = today();
  const week = query.week ? selectedWeekEnding(query.week) : await employeeWeekEnding(id, date);
  const firstDay = weekStarting(week);
  const [employee, period, docs, pays, pendingDays] = await Promise.all([
    db.employee.findUnique({ where: { id }, include: {
      rates: { orderBy: { effectiveAt: "desc" } },
      absences: { orderBy: { day: "desc" }, take: 60, include: {
        deductionEntry: { select: { amount: true, document: { select: { reference: true } } } },
      } },
    } }),
    weeklyRecord(id, week), documents(["payroll","employeeOpening","advanceOpening"], {staff:id}), payments({staff:id}),
    db.employeeAbsence.count({where:pendingAbsencesForWeek(id,week)}),
  ]);
  if (!employee) notFound();
  const t = (key: string) => translate(lang, key);
  const path = "/payroll/" + id;
  const active = employedOn(employee, date);
  const absent = employee.absences.some(row => today(row.day) === date && !row.voidedAt);
  const allocations = period?.allocations.filter(row=>!row.releasedAt && !row.payment.reversedAt) ?? [];
  const advances = allocations.filter(row=>row.payment.kind==="advance").reduce((sum,row)=>sum+row.amount,0n);
  const paid = allocations.filter(row=>row.payment.kind==="salaryPayment").reduce((sum,row)=>sum+row.amount,0n);
  const deductionIds = new Set(period?.payroll.filter(row=>row.kind==="deduction").map(row=>row.id));
  const deductions = -(period?.payroll.filter(row=>row.kind==="deduction" || row.kind==="correction" && deductionIds.has(row.reference))
    .reduce((sum,row)=>sum+row.amount,0n) ?? 0n);
  const pendingAbsence = pendingDays > 0;
  const gross = period ? period.payroll.filter(row=>row.kind==="base"||row.kind==="daily").reduce((sum,row)=>sum+row.amount,0n) : employee.weeklySalary;
  const remaining = (period?.total ?? 0n) - advances - paid;
  const mayManage = forms.can("weeklyPayroll");
  const editable = mayManage && (period ? remaining > 0n : workedDuringWeek(employee, week));
  const following = mayManage && active && period && remaining === 0n ? await nextAdjustmentWeek(id,week) : null;
  const selected: PayWeek = { week, period, remaining, pendingAbsence };
  const target: PayWeek = following && workedDuringWeek(employee,following.week)
    ? { ...following, pendingAbsence: await db.employeeAbsence.count({where:pendingAbsencesForWeek(id,following.week)}) > 0 }
    : selected;
  const forwarded = target.week !== week;
  const adjustments = editable || forwarded;
  const hasSalary = (employee.weeklySalary ?? 0n) > 0n;
  const needSalary = !hasSalary && (editable && !period || adjustments && !target.period);
  const mayPay = editable && (period !== null || hasSalary);
  const mayAdjust = adjustments && (target.period !== null || hasSalary);
  const locked = (target.period?.metadata as {locked?:boolean} | undefined)?.locked;
  const accounts = forms.adapters.accounts;
  const payrollAction = (kind: PayrollAction) => <ActionForm key={week+kind} lang={lang} primary={kind==="salaryPayment"}
    spec={payrollForm({ kind, employee, selected, target: kind==="salaryPayment" ? selected : target, accounts, lang })}/>;
  const profile = { ...forms.employee(plain(employee)), destination: path+"?week="+week };
  const dismiss: ActionSpec = {
    action: "employeeDismiss", title: "Dismiss employee", submitLabel: "Confirm dismissal", destination: path,
    hidden: { id, version: employee.version },
    fields: [
      { key: "endedAt", label: "Last working day", type: "date", value: date, min: today(employee.startedAt), max: date, required: true, ltr: true },
      { key: "reason", label: "Reason", type: "textarea", required: true, wide: true },
    ],
  };
  return <><Heading lang={lang} title={employee.name} description={t(active ? absent ? "Absent today" : "Active" : employee.dismissalReason ? "Dismissed" : "Inactive")}>
    <ButtonLink href="/payroll">{t("Employees & payroll")}</ButtonLink>
    {active && forms.can("employeeAbsence") && <AbsenceToggle employeeId={id} absent={absent} lang={lang}/>}
    <Actions lang={lang} forms={forms} specs={[profile]}/>
    {active && forms.can("employeeDismiss") && <ActionForm lang={lang} spec={dismiss}/>}
  </Heading>
    <div className="detail-stack">
      <Panel title={t("Weekly payroll")}>
        <div className="payroll-week">
          <Form key={week} action={path} prefetch={false} className="log-actions">
            <label className="field">{t("Week ending")}<input type="date" name="week" dir="ltr" defaultValue={week} required/></label>
            <Button type="submit">{t("Show week")}</Button>
          </Form>
          <p className="payroll-week-dates"><bdi>{day(lang,absenceDate(firstDay))}</bdi> – <bdi>{day(lang,absenceDate(week))}</bdi></p>
          <dl className="payroll-balances">
            <div><dt>{t("Weekly salary")}</dt><dd><Amt lang={lang} value={gross}/></dd></div>
            <div><dt>{t("Deductions")}</dt><dd><Amt lang={lang} value={deductions}/></dd></div>
            <div><dt>{t("Cash advances")}</dt><dd><Amt lang={lang} value={advances}/></dd></div>
            <div><dt>{t("Salary paid")}</dt><dd><Amt lang={lang} value={paid}/></dd></div>
            <div><dt>{t("Remaining salary")}</dt><dd><Amt lang={lang} value={period ? remaining : null}/></dd></div>
          </dl>
          {needSalary && <p className="notice">{t("Set the weekly salary in Edit profile to open a pay week.")}</p>}
          {pendingAbsence && <p className="notice">{t("Absence deduction pending")}</p>}
          <div className="log-actions">
            {mayPay && (accounts.length ? payrollAction("salaryPayment") : <ButtonLink href="/cash?new=account">{t("Set up a cash account")}</ButtonLink>)}
            {mayAdjust && active && accounts.length > 0 && payrollAction("advance")}
            {mayAdjust && !locked && payrollAction("deduction")}
            {forwarded && <ButtonLink href={path+"?week="+target.week}>{t("View next unpaid week")}</ButtonLink>}
            {period && <ButtonLink href={"/record/"+period.id}>{t("View weekly ledger")}</ButtonLink>}
          </div>
        </div>
      </Panel>
      <Panel title={t("Pay periods")}><Register lang={lang} head={["Number","Pay period","Status","Total","Amount due"]} rows={docs.map(row=>[
        <Ref href={"/record/"+row.id}>{row.number}</Ref>,
        row.category==="weekly" ? <Ref href={path+"?week="+row.reference}>{day(lang,absenceDate(row.reference))}</Ref> : <bdi>{row.reference || day(lang,row.at)}</bdi>,
        <Badge lang={lang} value={row.status}/>,<Amt lang={lang} value={row.total}/>,<Amt lang={lang} value={row.due}/>,
      ])}/></Panel>
      <Panel title={t("Payments")}><PayRegister lang={lang} rows={pays}/></Panel>
      <Panel title={t("Attendance history")}><Register lang={lang} head={["Date","Status","Salary deduction","Pay week ending"]} rows={employee.absences.map(row=>[
        day(lang,row.day),t(row.voidedAt ? "Absence undone" : "Absent"),
        !row.voidedAt && row.deductionEntry ? <Amt lang={lang} value={-row.deductionEntry.amount}/> :
          !row.voidedAt && row.deductSalary ? t("Pending") : null,
        !row.voidedAt && row.deductionEntry ?
          <Ref href={path+"?week="+row.deductionEntry.document.reference}>{day(lang,absenceDate(row.deductionEntry.document.reference))}</Ref> : null,
      ])}/></Panel>
      <Info lang={lang} items={[
        ["Phone",employee.phone],["Pay arrangement",employee.arrangement],["Rate",<Amt lang={lang} value={employee.rate}/>],
        ["Paid days per week",employee.paidDaysPerWeek],
        ["Start date",day(lang,employee.startedAt)],["End date",employee.endedAt?day(lang,employee.endedAt):null],
        ["Dismissal reason",employee.dismissalReason],["Notes",employee.note],
      ]}/>
      <Panel title={t("Rate history")}><Register lang={lang} head={["Effective date","Pay arrangement","Rate"]} rows={employee.rates.map(item=>[
        day(lang,item.effectiveAt),<bdi>{item.arrangement}</bdi>,<Amt lang={lang} value={item.amount}/>,
      ])}/></Panel>
    </div>
  </>;
}
