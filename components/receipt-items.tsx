import Link from "./navigation-link";
import { day, label, money, translate, type Language } from "@/lib/locale";
import type { receiptDetails } from "@/lib/receipt-details";
import { BillItems } from "./bill-items";

type Details = Awaited<ReturnType<typeof receiptDetails>>;
type Car = { make?: string; model?: string; plate?: string };

export function ReceiptItems({ lang, details, print }: { lang: Language; details: Details; print?: boolean }) {
  const t = (key: string) => translate(lang, key);
  const amt = (amount: bigint) => <bdi>{money(lang, amount)}</bdi>;
  return <>
    {details.bills.map(({ document, applied, released, atPayment, current }) => {
      const car = (document.snapshot as { vehicle?: Car } | null)?.vehicle;
      const carText = car && [car.make, car.model, car.plate].filter(Boolean).join(" · ");
      const number = <bdi>{document.number}</bdi>;
      return <section className="receipt-bill" key={document.id}>
        <header>
          <h2>{label(lang, document.kind)} {print ? number : <Link className="id-link" href={"/record/" + document.id}>{number}</Link>}</h2>
          <p>{t("Date")} <bdi>{day(lang, document.at)}</bdi></p>
          {carText && <p>{t("Vehicle")} <bdi>{carText}</bdi></p>}
          {released && <p>{t("Allocation released")}</p>}
        </header>
        <div className={print ? undefined : "table-scroll"}><BillItems lang={lang} bill={document}/></div>
        <dl className="receipt-bill-totals">
          <div><dt>{t(document.kind === "invoice" ? "Invoice total" : "Total")}</dt><dd>{amt(document.total)}</dd></div>
          <div><dt>{t("Applied from this payment")}</dt><dd>{amt(applied)}</dd></div>
          {atPayment !== null && <div><dt>{t("Balance after this payment")}</dt><dd>{amt(atPayment)}</dd></div>}
          {current !== null && <div><dt>{t("Current balance")}</dt><dd>{amt(current)}</dd></div>}
        </dl>
        {document.note && <p className="receipt-bill-note"><bdi>{document.note}</bdi></p>}
      </section>;
    })}
    {details.customerDebtAfter !== null && <p className="receipt-customer-total">
      <strong>{t("Customer balance after payment")}</strong> {amt(details.customerDebtAfter)}
    </p>}
  </>;
}
