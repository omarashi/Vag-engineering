import Form from "next/form";
import { notFound } from "next/navigation";
import type { Document, Employee } from "@prisma/client";
import { db, plain } from "@/lib/db";
import { day, money, translate, type Language } from "@/lib/locale";
import { absenceDate, employedOn, employeeWeekEnding, payrollReviews, payrollSummary, payrollWeek, pendingAbsencesForWeek, selectedWeekEnding, weekStarting, weeklyRecord, workWeekStarting, workedDuringWeek } from "@/lib/payroll";
import { addDays, cairoDayStart, today } from "@/lib/rules";
import { currentWeekEnding, payrollLocked, payrollPayday, payrollPeriodStarting } from "@/lib/payroll-rules";
import { documents, payments } from "@/lib/views";
import { AbsenceToggle } from "./absence-toggle";
import { ActionForm, type ActionSpec, type Field } from "./action-form";
import type { ModuleProps } from "./modules";
import { Actions, Amt, CashAccountSetup, Heading, Info, PayRegister, Ref, Register } from "./register";
import { Badge, Button, ButtonLink, Panel } from "./ui";

type PayrollAction = "salaryPayment" | "advance" | "deduction";
type PayWeek = { week: string; period: Document | null; remaining: bigint; pendingAbsence: boolean };

const actionTitles: Record<PayrollAction, string> = {
  salaryPayment: "Pay weekly salary",
  advance: "Record cash advance",
  deduction: "Deduct salary",
};

function payrollForm({ kind, employee, selected, payVia, lang }: {
  kind: PayrollAction; employee: Employee; selected: PayWeek;
  payVia: Field; lang: Language;
}): ActionSpec {
  const date = today();
  const deduction = kind === "deduction";
  const { week, period, remaining, pendingAbsence } = selected;
  const payday = period ? payrollPayday(period) : week;
  const start = today(employee.startedAt);
  const showWeek = !period && kind !== "salaryPayment";
  return {
    action: "weeklyPayroll", title: actionTitles[kind],
    submitLabel: kind === "salaryPayment" ? "Record salary payment" : deduction ? "Save deduction" : "Save advance",
    destination: "/payroll/" + employee.id + "?week=" + week,
    hidden: { employeeId: employee.id, weekEnding: week, kind, periodId: period?.id ?? "",
      ...(period ? { version: period.version, expectedBalance: String(remaining) } : {}),
      ...(!period ? { expectedWeeklySalary: String(employee.weeklySalary) } : {}),
    },
    formSummary: {
      name: employee.name,
      label: showWeek ? "Week ending" : period ? "Remaining salary" : "Weekly salary",
      amount: showWeek ? day(lang, absenceDate(week)) : money(lang, period ? remaining : employee.weeklySalary ?? 0n),
      note: pendingAbsence ? "Pending absence deductions apply before payment." : undefined,
    },
    fields: [
      ...(kind !== "salaryPayment" ? [{
        key: "amount", label: "Amount (EGP)", required: true, wide: true, ltr: true, inputMode: "decimal" as const,
      }] : []),
      ...(!deduction ? [payVia] : []),
      { key: "at", label: "Date", type: "date", value: date, min: kind === "salaryPayment" && payday && payday > start ? payday : start,
        max: date, required: true, ltr: true },
      { key: "note", label: deduction ? "Reason" : "Notes", type: "textarea", wide: true, required: deduction },
    ],
  };
}

function PayrollReviewPanel({ lang, reviews, destination }: {
  lang:Language; reviews:Awaited<ReturnType<typeof payrollReviews>>; destination:string;
}) {
  if (!reviews.length) return null;
  const t=(key:string)=>translate(lang,key);
  return <Panel title={t("Payroll needs review")}>
    <Register lang={lang} head={["Employee","Date","Pay week ending","Type","Unresolved amount","Action"]} rows={reviews.map((review)=>{
      const period=review.document;
      return [
        period.employee && <Ref href={"/payroll/"+period.employee.id+"?week="+period.reference}>{period.employee.name}</Ref>,
        day(lang,review.at),day(lang,absenceDate(period.reference)),
        <div className="accounting-entries">
          {review.payment ? <Ref href={"/payment/"+review.payment.id}>{t("Cash advance")} {review.payment.number}</Ref>
            : t(review.absence ? review.absence.halfDay ? "Half-day deduction" : "Absence deduction" : "Salary deduction")}
          {review.note && <bdi>{t(review.note)}</bdi>}
        </div>,
        <Amt lang={lang} value={review.balance}/>,
        <ActionForm lang={lang} spec={{
          action:"resolvePayrollExcess",title:"Review excess",destination,
          hidden:{id:review.id,expectedBalance:String(review.balance)},
          formSummary:{label:"Unresolved amount",amount:money(lang,review.balance)},
          fields:[
            {key:"resolution",label:"Action",type:"select",required:true,value:"apply",options:[
              {value:"apply",name:t("Apply to this pay week")},
              {value:"waive",name:t("Waive excess deduction")},
            ]},
            {key:"reason",label:"Reason",type:"textarea",wide:true,required:true},
          ],
        }}/>,
      ];
    })}/>
  </Panel>;
}

export async function Payroll({ lang, forms, query }: ModuleProps) {
  const now = today();
  const start = workWeekStarting(query.week ? selectedWeekEnding(query.week) : now);
  const days = Array.from({length:6},(_,index)=>addDays(start,index));
  const saturday = currentWeekEnding(start);
  const markedDay = query.date && days.includes(query.date) && query.date <= now ? query.date :
    days.includes(now) ? now : now > addDays(saturday,1) ? saturday : "";
  const [people,reviews,upcoming,archived] = await Promise.all([
    payrollWeek(start,query.staff,query.q),
    payrollReviews(query.staff),
    start===workWeekStarting(now) ? db.employee.findMany({where:{
      id:query.staff||undefined, name:query.q?{contains:query.q,mode:"insensitive"}:undefined,
      archived:false, startedAt:{gte:cairoDayStart(addDays(saturday,1))},
    },select:{id:true,name:true,startedAt:true},orderBy:[{startedAt:"asc"},{name:"asc"}]}) : [],
    db.employee.findMany({where:{archived:true},select:{id:true,name:true},orderBy:{name:"asc"}}),
  ]);
  const t = (key: string) => translate(lang, key);
  const name = new Intl.DateTimeFormat(lang==="ar"?"ar-EG":"en-GB",{weekday:"short",timeZone:"UTC"});
  const weekLabels = days.map(value=>name.format(absenceDate(value))+" "+day(lang,absenceDate(value),"short"));
  const rows=people.map(employee=>{
    const period=employee.documents[0] ?? null;
    const week=period?.reference ?? saturday;
    const summary=payrollSummary(employee,period);
    const options=employee.absences.find(row=>today(row.day)===markedDay);
    const absenceDays=employee.absences.filter(row=>!row.halfDay).length;
    const halfDays=employee.absences.length-absenceDays;
    return {employee,week,summary,options,absenceDays,halfDays,projected:!period};
  });
  const amounts=(summary:ReturnType<typeof payrollSummary>)=>[
    summary.gross,summary.advances-summary.carried,summary.carried,summary.deductions,summary.net,summary.paid,summary.remaining,
  ];
  const totals=rows.reduce((sums,{summary})=>amounts(summary).map((amount,index)=>sums[index]+(amount ?? 0n)),Array<bigint>(7).fill(0n));
  const moneyCells=(values:(bigint|null)[])=>values.map(value=><Amt lang={lang} value={value}/>);
  const cells=rows.map(({employee,week,summary,options,absenceDays,halfDays,projected})=>[
    <div className="accounting-entries"><Ref href={"/payroll/"+employee.id+"?week="+week}>{employee.name}</Ref>
      <small>{t("Pay week ending")} <bdi>{day(lang,absenceDate(week),"short")}</bdi>{projected && " · "+t("Projected")}</small>
      {markedDay && forms.can("employeeAbsence") && employedOn(employee,markedDay) &&
        <AbsenceToggle key={employee.id+markedDay} lang={lang} employeeId={employee.id} day={markedDay}
          state={options ? options.halfDay?"halfDay":"mark":undefined}/>}
    </div>,
    ...days.map(value=>{
      const absence=employee.absences.find(row=>today(row.day)===value);
      const advances=employee.payments.filter(row=>today(row.at)===value);
      const payWeek=absence?.deductionEntry?.document.reference ?? absence?.excesses[0]?.document.reference
        ?? (absence?.deductionFromDay && addDays(today(absence.deductionFromDay),6));
      return absence || advances.length ? <div className="accounting-entries">
        {absence && <>
          <span className={"attendance-status "+(absence.halfDay?"attendance-half":"attendance-absent")}>
            {t(absence.halfDay?"Half-day deduction":"Absent")}
          </span>
          {absence.deductionEntry && <Amt lang={lang} value={-absence.deductionEntry.amount}/>}
          {!absence.deductionEntry && absence.deductSalary && <small>{t("Pending")}</small>}
          {payWeek && payWeek!==week && <small>{t("Pay week ending")} <bdi>{day(lang,absenceDate(payWeek),"short")}</bdi></small>}
        </>}
        {advances.map(advance=><div key={advance.id}>
          <Ref href={"/payment/"+advance.id}><Amt lang={lang} value={advance.amount}/></Ref>
          {advance.allocations.filter(row=>row.document.reference!==week).map(row=><small key={row.id} className="accounting-period">
            {t("Pay week ending")} <bdi>{day(lang,absenceDate(row.document.reference),"short")}</bdi>
          </small>)}
        </div>)}
      </div> : null;
    }),
    absenceDays,halfDays,...moneyCells(amounts(summary)),
  ]);
  if (rows.length) cells.push([
    <strong>{t(query.staff || query.q ? "Selected employees total" : "Team total")}</strong>,...days.map(()=>null),
    rows.reduce((sum,row)=>sum+row.absenceDays,0),rows.reduce((sum,row)=>sum+row.halfDays,0),
    ...moneyCells(totals),
  ]);
  return <><Heading lang={lang} title="Employees & payroll" description={t("Monday to Saturday · Payday is Saturday · Sunday off")}>
    <Actions lang={lang} forms={forms} specs={[forms.employee()]} auto={query.new}/>
  </Heading>
    <div className="detail-stack">
      <Panel title={t("Weekly payroll sheet")}>
        <Form key={start+markedDay+query.staff+query.q} action="/payroll" prefetch={false} className="toolbar">
          <label className="accounting-filter">{t("Workweek starting")}
            <input name="week" type="date" defaultValue={start} max={now} required/>
          </label>
          <label className="accounting-filter">{t("Attendance date")}
            <select name="date" defaultValue={markedDay} aria-label={t("Attendance date")}>
              <option value="">{t("Auto")}</option>
              {days.filter(value=>value<=now).map(value=><option key={value} value={value}>{day(lang,absenceDate(value))}</option>)}
            </select>
          </label>
          <label className="accounting-filter">{t("Employee")}
            <select name="staff" defaultValue={query.staff ?? ""}>
              <option value="">{t("All employees")}</option>
              {forms.adapters.staff.map(row=><option key={row.value} value={row.value}>{row.name}</option>)}
              {archived.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          <Button type="submit">{t("Show week")}</Button>
        </Form>
        <Register lang={lang} stickyKey head={[
          "Employee",...weekLabels,"Absence days","Half-day deductions","Weekly salary","Weekly advances","Carried advances",
          "Deductions","Net pay","Salary paid","Remaining salary",
        ]} rows={cells}/>
      </Panel>
      <PayrollReviewPanel lang={lang} reviews={reviews} destination={"/payroll?week="+start}/>
      {upcoming.length>0 && <Panel title={t("Upcoming employee starts")}>
        <Register lang={lang} head={["Employee","Start date"]} rows={upcoming.map(row=>[
          <Ref href={"/payroll/"+row.id}>{row.name}</Ref>,day(lang,row.startedAt),
        ])}/>
      </Panel>}
      {archived.length>0 && <Panel title={t("Archived employees")}>
        <ul className="log-list">{archived.map(row=><li className="detail-copy" key={row.id}><Ref href={"/payroll/"+row.id}>{row.name}</Ref></li>)}</ul>
      </Panel>}
    </div>
  </>;
}

export async function EmployeeView({ lang, forms, id, query }: ModuleProps & { id: string }) {
  const date = today();
  const [employee, docs, pays, reviews] = await Promise.all([
    db.employee.findUnique({ where: { id }, include: {
      rates: { orderBy: { effectiveAt: "desc" } },
      absences: { orderBy: { day: "desc" }, take: 60, include: {
        deductionEntry: { select: { amount: true, document: { select: { reference: true } } } },
      } },
    } }),
    documents(["payroll","employeeOpening","advanceOpening"], {staff:id}), payments({staff:id}),
    payrollReviews(id),
  ]);
  if (!employee) notFound();
  const start = today(employee.startedAt);
  const notStarted = date < start;
  const week = await employeeWeekEnding(id, query.week ? selectedWeekEnding(query.week) : notStarted ? start : date);
  const period = await weeklyRecord(id,week);
  const firstDay = period ? payrollPeriodStarting(period) : weekStarting(week);
  const pendingAbsence = (await db.employeeAbsence.count({where:pendingAbsencesForWeek(id,week,firstDay)})) > 0;
  const t = (key: string) => translate(lang, key);
  const path = "/payroll/" + id;
  const active = employedOn(employee, date);
  const attendance = employee.absences.find(row => today(row.day) === date && !row.voidedAt);
  const {gross,advances,paid,deductions,remaining} = payrollSummary(employee,period);
  const mayManage = forms.can("weeklyPayroll");
  const editable = mayManage && !notStarted && (period ? remaining > 0n : workedDuringWeek(employee, week));
  const selected: PayWeek = { week, period, remaining, pendingAbsence };
  const hasSalary = (employee.weeklySalary ?? 0n) > 0n;
  const needSalary = !hasSalary && editable && !period;
  const locked = period && payrollLocked(period);
  const mayAdjust = !locked && editable && (period !== null || hasSalary);
  const payday = period ? payrollPayday(period) : week;
  const beforePayday = Boolean(payday && date < payday);
  const mayPay = mayAdjust && !beforePayday;
  const accounts = forms.adapters.accounts;
  const payrollAction = (kind: PayrollAction) => <ActionForm key={week+kind} lang={lang} primary={kind==="salaryPayment"}
    spec={payrollForm({ kind, employee, selected, payVia:forms.adapters.payVia, lang })}/>;
  const profile = { ...forms.employee(plain(employee)), destination: path+"?week="+week };
  const dismiss: ActionSpec = {
    action: "employeeDismiss", title: "Dismiss employee", submitLabel: "Confirm dismissal", destination: path,
    hidden: { id, version: employee.version },
    fields: [
      { key: "endedAt", label: "Last working day", type: "date", value: date, min: today(employee.startedAt), max: date, required: true, ltr: true },
      { key: "reason", label: "Reason", type: "textarea", required: true, wide: true },
    ],
  };
  return <><Heading lang={lang} title={employee.name} description={t(active ? attendance ? attendance.halfDay ? "Half-day deduction" : "Absent today" : "Active" : employee.dismissalReason ? "Dismissed" : notStarted ? "Not started" : "Inactive")}>
    <ButtonLink href="/payroll">{t("Employees & payroll")}</ButtonLink>
    {active && absenceDate(date).getUTCDay()!==0 && forms.can("employeeAbsence")
      && <AbsenceToggle employeeId={id} state={attendance ? attendance.halfDay?"halfDay":"mark":undefined} lang={lang}/>}
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
          {mayAdjust && beforePayday && <p className="notice">{t("Salary can be recorded from Saturday, the end of the pay week.")}</p>}
          {pendingAbsence && <p className="notice">{t("Absence deduction pending")}</p>}
          {locked && remaining>0n &&
            <p className="notice">{t("A finalized period with a balance needs Owner review.")}</p>}
          <div className="log-actions">
            {mayPay && (accounts.length ? payrollAction("salaryPayment") : <CashAccountSetup lang={lang} canManage={forms.can("account")}/>)}
            {mayAdjust && active && accounts.length > 0 && payrollAction("advance")}
            {mayAdjust && payrollAction("deduction")}
            {period && <ButtonLink href={"/record/"+period.id}>{t("View weekly ledger")}</ButtonLink>}
          </div>
        </div>
      </Panel>
      <PayrollReviewPanel lang={lang} reviews={reviews} destination={path+"?week="+week}/>
      <Panel title={t("Pay periods")}><Register lang={lang} head={["Number","Pay period","Status","Total","Amount due"]} rows={docs.map(row=>[
        <Ref href={"/record/"+row.id}>{row.number}</Ref>,
        row.category==="weekly" ? <Ref href={path+"?week="+row.reference}>{day(lang,absenceDate(row.reference))}</Ref> : <bdi>{row.reference || day(lang,row.at)}</bdi>,
        <Badge lang={lang} value={row.status}/>,<Amt lang={lang} value={row.total}/>,<Amt lang={lang} value={row.due}/>,
      ])}/></Panel>
      <Panel title={t("Payments")}><PayRegister lang={lang} rows={pays}/></Panel>
      <Panel title={t("Attendance history")}><Register lang={lang} head={["Date","Status","Salary deduction","Pay week ending"]} rows={employee.absences.map(row=>[
        day(lang,row.day),t(row.voidedAt ? "Absence undone" : row.halfDay ? "Half-day deduction" : "Absent"),
        !row.voidedAt && row.deductionEntry ? <Amt lang={lang} value={-row.deductionEntry.amount}/> :
          !row.voidedAt && row.deductSalary ? t("Pending") : null,
        !row.voidedAt && row.deductionEntry ?
          <Ref href={path+"?week="+row.deductionEntry.document.reference}>{day(lang,absenceDate(row.deductionEntry.document.reference))}</Ref> : null,
      ])}/></Panel>
      <Info lang={lang} items={[
        ["Phone",employee.phone],["Pay arrangement",employee.arrangement],
        ["Paid days per week",employee.paidDaysPerWeek],
        ["Start date",day(lang,employee.startedAt)],["End date",employee.endedAt?day(lang,employee.endedAt):null],
        ["Dismissal reason",employee.dismissalReason],["Notes",employee.note],
      ]}/>
      {employee.rates.some(item=>item.amount!==0n) && <Panel title={t("Rate history")}><Register lang={lang} head={["Effective date","Pay arrangement","Rate"]} rows={employee.rates.map(item=>[
        day(lang,item.effectiveAt),<bdi>{item.arrangement}</bdi>,<Amt lang={lang} value={item.amount}/>,
      ])}/></Panel>}
    </div>
  </>;
}
