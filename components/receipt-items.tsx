import Link from "./navigation-link";
import { day, label, money, translate, type Language } from "@/lib/locale";
import type { receiptDetails } from "@/lib/receipt-details";
import { carName } from "@/lib/car-name";
import { BillItems } from "./bill-items";

type Details = NonNullable<Awaited<ReturnType<typeof receiptDetails>>>;
type Car = { make?: string; model?: string; color?: string; plate?: string };

export function ReceiptItems({ lang, details, print }: { lang: Language; details: Details; print?: boolean }) {
  const t = (key: string) => translate(lang, key);
  const amt = (amount: bigint) => <bdi>{money(lang, amount)}</bdi>;
  return <>
    {details.bills.map(({ document, released }) => {
      const car = (document.snapshot as { vehicle?: Car } | null)?.vehicle;
      const carText = car && [carName(car), car.plate].filter(Boolean).join(" · ");
      const number = <bdi>{document.number}</bdi>;
      return <section className="receipt-bill" key={document.id}>
        <header>
          <h2>{label(lang, document.kind)} {print ? number : <Link className="id-link" href={"/record/" + document.id}>{number}</Link>}</h2>
          <p>{t("Date")} <bdi>{day(lang, document.at)}</bdi></p>
          {carText && <p>{t("Vehicle")} <bdi>{carText}</bdi></p>}
          {released && <p>{t("Allocation released")}</p>}
        </header>
        <div className={print ? undefined : "table-scroll"}><BillItems lang={lang} bill={document}/></div>
        {document.note && <p className="receipt-bill-note"><bdi>{document.note}</bdi></p>}
      </section>;
    })}
    <dl className="receipt-totals">
      {details.discount>0n&&<div><dt>{t("Discount")}</dt><dd>{amt(details.discount)}</dd></div>}
      <div><dt>{t("Total")}</dt><dd>{amt(details.total)}</dd></div>
      <div><dt>{t("Paid")}</dt><dd>{amt(details.paid)}</dd></div>
    </dl>
  </>;
}
