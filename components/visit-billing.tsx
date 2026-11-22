import type { Role } from "@prisma/client";
import Link from "./navigation-link";
import { db } from "@/lib/db";
import { day, money, translate, type Language } from "@/lib/locale";
import { can } from "@/lib/permissions";
import { extended, today, units } from "@/lib/rules";
import { due } from "@/lib/trade";
import type { VisitPart, WorkDetail } from "@/lib/visit-items";
import { receiptAccounts, receiptFields } from "@/lib/visit-forms";
import { ActionForm, type ActionSpec, type Field } from "./action-form";
import type { VisitInvoicePricing } from "./visit-invoice-fields";
import { ButtonLink, Panel } from "./ui";

export async function VisitBilling({ lang, id, role, work, parts, version, autoReceipt }: {
  lang: Language; id: string; role: Role; work: WorkDetail[]; parts: VisitPart[]; version: number; autoReceipt: boolean;
}) {
  const [invoice, accounts] = await Promise.all([
    db.document.findFirst({
      where: { sourceId: id, kind: "invoice", status: "posted" },
      include: { allocations: { where: { releasedAt: null, payment: { kind: "receipt", reversedAt: null } }, include: { payment: true } } },
    }),
    can(role, "visitReceipt") ? receiptAccounts() : [],
  ]);
  const t = (key: string) => translate(lang, key);
  const balance = invoice ? await due(db, invoice) : null;
  const mayBill = can(role, "visitReceipt") && (invoice ? (balance ?? 0n) > 0n : work.length > 0);
  const invoicePricing: VisitInvoicePricing = {
    work,
    parts: parts.map((part) => ({ ...part, lineTotal: String(extended(units(part.quantity), BigInt(part.unitPrice))) })),
  };
  const partsSubtotal = invoicePricing.parts.reduce((sum, item) => sum + BigInt(item.lineTotal), 0n);
  const at: Field = { key: "at", type: "date", label: "Date", value: today(), ltr: true, required: true };
  const receipt: ActionSpec = {
    action: "visitReceipt", title: "Record a receipt", submitLabel: "Save receipt", destination: "/payment/$id",
    hidden: { visitId: id, visitVersion: version }, invoicePricing: invoice ? undefined : invoicePricing,
    fields: receiptFields(lang, accounts),
    formSummary: invoice ? { label: "Amount due", amount: money(lang, balance ?? 0n) } : undefined,
  };
  const invoiceAction: ActionSpec = {
    action: "visitInvoice", title: "Create invoice", submitLabel: "Save invoice", destination: "/record/$id",
    hidden: { visitId: id, visitVersion: version }, invoicePricing, fields: [at],
  };
  const byPayment = new Map<string, { pay: NonNullable<typeof invoice>["allocations"][number]["payment"]; amount: bigint }>();
  for (const { payment: pay, amount } of invoice?.allocations ?? []) {
    byPayment.set(pay.id, { pay, amount: (byPayment.get(pay.id)?.amount ?? 0n) + amount });
  }
  const payments = [...byPayment.values()];
  return <Panel title={t("Billing")}>
    <div className="visit-billing-content">
      {invoice ? <dl className="visit-billing-totals">
        <div><dt>{t("Invoice")}</dt><dd><Link href={"/record/" + invoice.id}><bdi>{invoice.number}</bdi></Link></dd></div>
        <div><dt>{t("Total")}</dt><dd><bdi>{money(lang, invoice.total)}</bdi></dd></div>
        <div><dt>{t("Amount due")}</dt><dd><bdi>{money(lang, balance ?? 0n)}</bdi></dd></div>
      </dl> : <div className="visit-billing-note">
        {t("No invoice yet")}{partsSubtotal > 0n && <p>{t("Parts subtotal")} <bdi>{money(lang, partsSubtotal)}</bdi></p>}
      </div>}
      <div className="log-actions">
        {mayBill && accounts.length > 0 && <ActionForm key={autoReceipt ? "checkout" : "receipt"} spec={receipt} lang={lang} primary auto={autoReceipt}/>}
        {mayBill && !accounts.length && <ButtonLink href="/cash?new=account">{t("Set up a cash account")}</ButtonLink>}
        {!invoice && work.length > 0 && can(role, "visitInvoice") && <ActionForm spec={invoiceAction} lang={lang}/>}
      </div>
    </div>
    {payments.length > 0 && <ul className="log-list visit-receipts">{payments.map(({pay,amount}) => <li key={pay.id}>
      <Link className="log-list-link" href={"/payment/" + pay.id}><span className="log-row-main">
        <strong><bdi>{pay.number}</bdi></strong><small>{day(lang, pay.at)}</small>
      </span><bdi>{money(lang, amount)}</bdi></Link>
    </li>)}</ul>}
  </Panel>;
}

