import Link from "./navigation-link";
import { day, label, money, translate, type Language } from "@/lib/locale";
import type { receiptDetails } from "@/lib/receipt-details";
import { carName } from "@/lib/car-name";
import { BillItems } from "./bill-items";
import { invoicePaymentType } from "@/lib/invoice-settlement";

type Details = NonNullable<Awaited<ReturnType<typeof receiptDetails>>>;
type Car = { make?: string; model?: string; color?: string; plate?: string };

export function ReceiptItems({ lang, details, print }: { lang: Language; details: Details; print?: boolean }) {
  const t = (key: string) => translate(lang, key);
  const amt = (amount: bigint) => <bdi>{money(lang, amount)}</bdi>;
  return <>
    {details.bills.map(({ document, released, settlement, received, before, after, discount }) => {
      const car = (document.snapshot as { vehicle?: Car } | null)?.vehicle;
      const carText = car && [carName(car), car.plate].filter(Boolean).join(" · ");
      const number = <bdi>{document.number}</bdi>;
      const invoice = document.kind === "invoice";
      const balance = after ?? settlement?.balance;
      const followUp = before !== null && (!invoice || before < document.total || details.bills.length > 1);
      return <section className="receipt-bill" key={document.id}>
        <header>
          <h2>{label(lang, document.kind)} {print ? number : <Link className="id-link" href={"/record/" + document.id}>{number}</Link>}</h2>
          <p>{t("Date")} <bdi>{day(lang, document.at)}</bdi></p>
          {carText && <p>{t("Vehicle")} <bdi>{carText}</bdi></p>}
          {released && <p>{t("Allocation released")}</p>}
        </header>
        <div className={print ? undefined : "table-scroll"}><BillItems lang={lang} bill={document}/></div>
        <dl className="receipt-totals">
          {invoice && balance !== undefined && <div><dt>{t("Payment type")}</dt><dd>{t(invoicePaymentType(balance, received))}</dd></div>}
          {followUp ? <div><dt>{t("Balance before payment")}</dt><dd>{amt(before)}</dd></div> : <>
            {discount > 0n && <div><dt>{t("Discount")}</dt><dd>{amt(discount)}</dd></div>}
            <div><dt>{t(invoice ? "Invoice total" : "Total")}</dt><dd>{amt(document.total)}</dd></div>
          </>}
          <div><dt>{t(followUp ? "Paid this time" : "Amount paid")}</dt><dd>{amt(received)}</dd></div>
          {settlement && settlement.credited > 0n && <div><dt>{t("Adjusted invoice total")}</dt><dd>{amt(settlement.adjusted)}</dd></div>}
          {settlement && settlement.applied > 0n && <div><dt>{t("Applied customer credit")}</dt><dd>{amt(settlement.applied)}</dd></div>}
          {settlement && settlement.credited > 0n && <div><dt>{t("Credits issued")}</dt><dd>{amt(settlement.credited)}</dd></div>}
          {settlement && settlement.refunded > 0n && <div><dt>{t("Refunds paid")}</dt><dd>{amt(settlement.refunded)}</dd></div>}
          {balance !== undefined && <div><dt>{t("Remaining balance")}</dt><dd>{amt(balance)}</dd></div>}
        </dl>
        {document.note && <p className="receipt-bill-note"><bdi>{document.note}</bdi></p>}
      </section>;
    })}
    {details.showReceiptAmount && <dl className="receipt-totals">
      <div><dt>{t("Total received")}</dt><dd>{amt(details.paid)}</dd></div>
    </dl>}
  </>;
}
