import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { openCustomerDebts } from "@/lib/customer-debt";
import { customerCredits } from "@/lib/customer-credit";
import { day, label, translate, type Language } from "@/lib/locale";
import { can } from "@/lib/permissions";
import { customerDebtForm, receiptAccounts } from "@/lib/visit-forms";
import { ActionForm } from "./action-form";
import { ButtonLink, Panel } from "./ui";
import { Amt, CashAccountSetup, PrintLink, Ref, Register } from "./register";
import { CustomerCreditLedger } from "./customer-credit-ledger";

export async function CustomerDebt({ lang, partyId, role, archived, name, auto, receipt }: {
  lang: Language; partyId: string; role: Role; archived: boolean; name:string; auto?:boolean; receipt?:string;
}) {
  const [debts, credit, accounts, history]=await Promise.all([openCustomerDebts(db,partyId),customerCredits(partyId),!archived?receiptAccounts():[],
    db.payment.findMany({where:{partyId,kind:{in:["receipt","refund"]}},orderBy:[{at:"desc"},{id:"desc"}],take:20,
      select:{id:true,number:true,at:true,amount:true,reversedAt:true,kind:true,allocations:{select:{amount:true,releasedAt:true,
        document:{select:{id:true,number:true}}}}}}),
  ]);
  const mayPay = debts.length > 0 && !archived && can(role, "customerDebtPayment");
  const invoices=debts.filter((row)=>row.kind==="invoice");
  const t = (key: string) => translate(lang, key);
  const balance = debts.reduce((sum, row) => sum + row.balance, 0n);
  const validReceipt=receipt && /^[a-z0-9_-]+$/i.test(receipt) && await db.payment.findFirst({where:{id:receipt,kind:"receipt",partyId},select:{id:true}});
  return <div id="customer-balance" className="detail-stack"><Panel title={t("Customer balance")}>
    {validReceipt&&<p className="notice log-saved" role="status">{t("Payment recorded")} <Ref href={"/payment/"+validReceipt.id}>{t("View receipt")}</Ref>
      {" · "}<Ref href={"/print/payment/"+validReceipt.id+"?lang="+lang}>{t("Print receipt")}</Ref></p>}
    <div className="customer-debt-summary">
      <div><span>{t("Outstanding balance")}</span><strong><Amt lang={lang} value={balance}/></strong></div>
      <div><span>{t("Available customer credit")}</span><strong><Amt lang={lang} value={credit.available}/></strong></div>
    </div>
    <div className="page-actions detail-copy">
      {mayPay&&accounts.length>0&&<>
        {invoices.length>0&&<ActionForm lang={lang} primary auto={auto} spec={customerDebtForm(lang,partyId,debts,accounts,{name})}/>}
        {(debts.length>1||!invoices.length)&&<ActionForm lang={lang} auto={auto&&!invoices.length} spec={customerDebtForm(lang,partyId,debts,accounts,{name,split:true})}/>}
      </>}
      {mayPay&&!accounts.length&&<CashAccountSetup lang={lang} canManage={can(role,"account")}/>}
      {!archived&&can(role,"customerRefund")&&<ButtonLink href={"/refunds?party="+partyId}>{t("Refund / Return")}</ButtonLink>}
      <ButtonLink href={"/balances?party="+partyId}>{t("Party statement")}</ButtonLink>
      <PrintLink lang={lang} type="statement" id={partyId}/>
    </div>
    {debts.length>0&&<Register lang={lang} head={["Unpaid invoices and balances","Date","Invoice total","Previously paid","Credits issued","Applied customer credit","Remaining debt","Action"]}
      rows={debts.map((row)=>[
        <Ref href={"/record/"+row.id}>{row.number} · {label(lang,row.kind)}</Ref>,day(lang,row.at),<Amt lang={lang} value={row.total}/>,
        <Amt lang={lang} value={row.paid}/>,<Amt lang={lang} value={row.credited}/>,<Amt lang={lang} value={row.applied}/>,<Amt lang={lang} value={row.balance}/>,
        mayPay&&accounts.length>0&&row.kind==="invoice"?<ActionForm lang={lang} spec={customerDebtForm(lang,partyId,[row],accounts,{name,selected:row.id})}/>:null,
      ])}/>}
  </Panel>
  {credit.sources.length>0&&<CustomerCreditLedger {...{lang,partyId,role,archived,name,credit,invoices,accounts}}/>}
  {history.length>0&&<Panel title={t("Recent payments and refunds")}><Register lang={lang} head={["Date","Number","Type","Amount","Allocations","Status"]}
    rows={history.map((row)=>[day(lang,row.at),<Ref href={"/payment/"+row.id}>{row.number}</Ref>,label(lang,row.kind),<Amt lang={lang} value={row.amount}/>,
      <div className="page-actions">{row.allocations.map((entry,index)=><span key={index}><Ref href={"/record/"+entry.document.id}>{entry.document.number}</Ref>
        {" · "}<Amt lang={lang} value={entry.amount}/>{entry.releasedAt?" · "+t("Allocation released"):""}</span>)}</div>,label(lang,row.reversedAt?"reversed":"posted"),
    ])}/></Panel>}
  </div>;
}
