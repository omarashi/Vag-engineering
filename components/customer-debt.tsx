import type { Role } from "@prisma/client";
import Link from "./navigation-link";
import { db } from "@/lib/db";
import { openCustomerDebts } from "@/lib/customer-debt";
import { day, label, money, translate, type Language } from "@/lib/locale";
import { can } from "@/lib/permissions";
import { customerDebtForm, receiptAccounts } from "@/lib/visit-forms";
import { ActionForm } from "./action-form";
import { ButtonLink, Panel } from "./ui";

export async function CustomerDebt({ lang, partyId, role, archived }: {
  lang: Language; partyId: string; role: Role; archived: boolean;
}) {
  const debts = await openCustomerDebts(db, partyId);
  const mayPay = debts.length > 0 && !archived && can(role, "customerDebtPayment");
  const accounts = mayPay ? await receiptAccounts() : [];
  const t = (key: string) => translate(lang, key);
  const balance = debts.reduce((sum, row) => sum + row.balance, 0n);
  return <div id="customer-balance"><Panel title={t("Customer balance")}>
    <div className="customer-debt-summary">
      <div><span>{t("Outstanding balance")}</span><strong><bdi>{money(lang, balance)}</bdi></strong></div>
      {mayPay && (accounts.length ? <ActionForm lang={lang} primary spec={customerDebtForm(lang, partyId, balance, accounts)}/>
        : <ButtonLink href="/cash?new=account">{t("Set up a cash account")}</ButtonLink>)}
    </div>
    {debts.length > 0 && <ul className="log-list customer-debt-list" aria-label={t("Unpaid invoices and balances")}>
      {debts.map((row) => <li key={row.id}><Link className="log-list-link" href={"/record/" + row.id}>
        <span className="log-row-main"><strong><bdi>{row.number}</bdi></strong><small>{label(lang, row.kind)} · {day(lang, row.at)}</small></span>
        <bdi>{money(lang, row.balance)}</bdi>
      </Link></li>)}
    </ul>}
  </Panel></div>;
}
