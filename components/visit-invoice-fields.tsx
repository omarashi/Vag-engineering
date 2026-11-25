"use client";

import { normalize, parseMoney } from "@/lib/decimal-input";
import { money, translate, type Language } from "@/lib/locale";
import { serviceName } from "@/lib/services";
import type { VisitPart, WorkDetail } from "@/lib/visit-items";

export type VisitInvoicePricing = {
  work: WorkDetail[];
  parts: (VisitPart & { lineTotal: string })[];
};

export function VisitInvoiceFields({ lang, pricing, prices, discount, onDiscountChange, onChange }: {
  lang: Language;
  pricing: VisitInvoicePricing;
  prices: Record<string, string>;
  discount: string;
  onDiscountChange: (discount: string) => void;
  onChange: (prices: Record<string, string>) => void;
}) {
  const t = (key: string) => translate(lang, key);
  const servicesSubtotal = pricing.work.reduce((sum, { service }) => {
    const price = parseMoney(prices[service]);
    return sum + (price !== null && price >= 0n ? price : 0n);
  }, 0n);
  const partsSubtotal = pricing.parts.reduce((sum, item) => sum + BigInt(item.lineTotal), 0n);
  const subtotal = servicesSubtotal + partsSubtotal;
  const reduction = parseMoney(discount.trim() || "0");
  const net = reduction !== null && reduction >= 0n && reduction <= subtotal ? subtotal - reduction : null;
  const quantity = new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-GB", { maximumFractionDigits: 3 });

  return <div className="invoice-pricing">
    <fieldset className="invoice-price-list">
      <legend>{t("Service prices (EGP)")}</legend>
      {pricing.work.map(({ service, detail }) => {
        const name = serviceName(lang, service);
        return <label key={service} className="invoice-price-row">
          <span>{name}{detail && <bdi className="invoice-service-detail">{detail}</bdi>}</span>
          <input name={"price-" + service} dir="ltr" inputMode="decimal" required maxLength={24}
            aria-label={t("Price for {service}").replace("{service}", name)}
            value={prices[service] ?? ""} onChange={(event) => onChange({ ...prices, [service]: event.target.value })}/>
        </label>;
      })}
    </fieldset>
    {pricing.parts.length > 0 && <section className="invoice-price-list" aria-label={t("Parts sold")}>
      <h3>{t("Parts sold")}</h3>
      <ul>{pricing.parts.map((item) => <li key={item.partId} className="invoice-price-row">
        <span><bdi>{item.name}</bdi><bdi className="invoice-service-detail">{item.code}</bdi>
          <small><bdi>{quantity.format(Number(normalize(item.quantity)))} × {money(lang, item.unitPrice)}</bdi></small>
        </span>
        <strong><bdi>{money(lang, item.lineTotal)}</bdi></strong>
      </li>)}</ul>
    </section>}
    <label className="invoice-price-row">
      <span>{t("Discount (EGP)")}</span>
      <input name="invoiceDiscount" dir="ltr" inputMode="decimal" maxLength={24}
        aria-invalid={net===null} value={discount} onChange={(event)=>onDiscountChange(event.target.value)}/>
    </label>
    <div className="invoice-price-row invoice-price-total">
      <strong>{t("Invoice total")}</strong>
      <output aria-label={t("Invoice total")}><bdi>{net===null ? "—" : money(lang,net)}</bdi></output>
    </div>
  </div>;
}
