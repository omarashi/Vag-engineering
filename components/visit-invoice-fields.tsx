"use client";

import { normalize, parseMoney } from "@/lib/decimal-input";
import { money, translate, type Language } from "@/lib/locale";
import { serviceName } from "@/lib/services";
import type { VisitPart, WorkDetail } from "@/lib/visit-items";
import { chargeTypes, importSellingTotal, type BillingService, type ChargeType, type ImportInput } from "@/lib/workshop-charges";
import { WorkshopBillingFields, type BillingValues, type SupplierOption } from "./workshop-billing-fields";

export type VisitInvoicePricing = {
  work: WorkDetail[];
  parts: (VisitPart & { lineTotal: string })[];
};

export type VisitWorkshopPricing = { selection: BillingService[]; suppliers: SupplierOption[] };

export function VisitInvoiceFields({ lang, pricing, prices, discount, onDiscountChange, onChange, billing, values, onBillingChange }: {
  lang: Language;
  pricing: VisitInvoicePricing;
  prices: Record<string, string>;
  discount: string;
  onDiscountChange: (discount: string) => void;
  onChange: (prices: Record<string, string>) => void;
  billing?: VisitWorkshopPricing;
  values: BillingValues;
  onBillingChange: (key: string, value: boolean | Partial<Record<ChargeType, string>> | ImportInput[]) => void;
}) {
  const t = (key: string) => translate(lang, key);
  const servicesSubtotal = pricing.work.reduce((sum, { service }) => {
    const price = parseMoney(prices[service]);
    return sum + (price !== null && price >= 0n ? price : 0n);
  }, 0n);
  const partsSubtotal = pricing.parts.reduce((sum, item) => sum + BigInt(item.lineTotal), 0n);
  const charges = (values.workshopCharges ?? {}) as Partial<Record<ChargeType, string>>;
  const selectedCharges = chargeTypes.filter((type) => billing?.selection.includes(type));
  const chargesSubtotal = selectedCharges.reduce((sum, type) => sum + (parseMoney(charges[type]) ?? 0n), 0n);
  const importsSubtotal = ((values.importItems ?? []) as ImportInput[]).reduce((sum, item) => sum + importSellingTotal(item), 0n);
  const subtotal = servicesSubtotal + partsSubtotal + chargesSubtotal + importsSubtotal;
  const reduction = parseMoney(discount.trim() || "0");
  const net = reduction !== null && reduction >= 0n && reduction <= subtotal ? subtotal - reduction : null;
  const quantity = new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-GB", { maximumFractionDigits: 3 });

  return <div className="invoice-pricing">
    {pricing.work.length > 0 && <fieldset className="invoice-price-list">
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
    </fieldset>}
    {pricing.parts.length > 0 && <section className="invoice-price-list" aria-label={t("Parts sold")}>
      <h3>{t("Parts sold")}</h3>
      <ul>{pricing.parts.map((item) => <li key={item.partId} className="invoice-price-row">
        <span><bdi>{item.name}</bdi><bdi className="invoice-service-detail">{item.code}</bdi>
          <small><bdi>{quantity.format(Number(normalize(item.quantity)))} × {money(lang, item.unitPrice)}</bdi></small>
        </span>
        <strong><bdi>{money(lang, item.lineTotal)}</bdi></strong>
      </li>)}</ul>
    </section>}
    {billing && billing.selection.length > 0 && <WorkshopBillingFields lang={lang} suppliers={billing.suppliers} values={values}
      onChange={onBillingChange} showImport={false} selectedCharges={selectedCharges}/>}
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
