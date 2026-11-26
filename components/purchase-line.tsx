import { translate, type Language } from "@/lib/locale";
import type { Option } from "./backoffice-form";
import { PurchaseProductPicker } from "./purchase-product-picker";

export type PurchaseQuoteOption = {
  value: string;
  description: string;
  brand: string;
  cost: string;
  version: number;
  linked: boolean;
};

type Row = Record<string, string>;

export function PurchaseLineFields({ lang, row, parts, quotes, onChange }: {
  lang: Language; row: Row; parts: Option[]; quotes: PurchaseQuoteOption[]; onChange: (row: Row) => void;
}) {
  const t = (key: string) => translate(lang, key);
  const source = row.productSource || "inventory";
  const quote = source === "quote" ? quotes.find((item) => item.value === row.quote) : undefined;

  function chooseSource(productSource: string) {
    onChange({ kind: "part", productSource, quantity: row.quantity, discount: "0", description: "", price: "" });
  }

  function chooseInventory(value: string) {
    const item = parts.find((item) => item.value === value);
    if (item) onChange({ ...row, partId: item.value, description: item.name, price: item.cost ?? "" });
  }

  function chooseQuote(value: string) {
    const item = quotes.find((item) => item.value === value);
    if (item) onChange({ ...row, quote: item.value, quoteVersion: String(item.version),
      description: item.description, price: item.cost, sellingPrice: "" });
  }

  return <>
    <label className="field wide">{t("Product source")}
      <select value={source} onChange={(event) => chooseSource(event.target.value)}>
        <option value="inventory">{t("Existing inventory")}</option>
        <option value="manual">{t("Add manually")}</option>
        {quotes.length > 0 && <option value="quote">{t("Add from price list")}</option>}
      </select>
    </label>
    {source === "inventory" && <PurchaseProductPicker key="inventory" lang={lang} title="Search inventory"
      options={parts} value={row.partId} onSelect={chooseInventory}/>}
    {source === "quote" && <PurchaseProductPicker key="quote" lang={lang} title="Search price list"
      options={quotes.map(({ value, brand, description }) => ({ value, name: [brand, description].filter(Boolean).join(" · "), search: value }))}
      value={row.quote} onSelect={chooseQuote}/>}
    <label className="field">{t(source === "manual" ? "Product name" : "Description")}
      <input required dir="auto" maxLength={source === "manual" ? 180 : 500} readOnly={source === "quote"} value={row.description}
        onChange={(event) => onChange({ ...row, description: event.target.value })}/>
    </label>
    {source === "manual" && <>
      <label className="field">{t("Brand")}<input dir="auto" maxLength={100} value={row.brand ?? ""}
        onChange={(event) => onChange({ ...row, brand: event.target.value })}/></label>
      <label className="field">{t("Product code (optional)")}<input dir="ltr" maxLength={50} value={row.code ?? ""}
        onChange={(event) => onChange({ ...row, code: event.target.value })}/></label>
    </>}
    {quote?.brand && <label className="field">{t("Brand")}<input readOnly dir="auto" value={quote.brand}/></label>}
    {([ ["quantity", "Quantity"], ["price", "Unit cost (EGP)"], ["discount", "Discount"] ] as const).map(([field, name]) =>
      <label className="field" key={field}>{t(name)}<input dir="ltr" inputMode="decimal" required={field !== "discount"}
        value={row[field]} onChange={(event) => onChange({ ...row, [field]: event.target.value })}/></label>)}
    {(source === "manual" || (quote && !quote.linked)) && <label className="field">{t("Selling price (EGP)")}
      <input required dir="ltr" inputMode="decimal" value={row.sellingPrice ?? ""}
        onChange={(event) => onChange({ ...row, sellingPrice: event.target.value })}/>
    </label>}
  </>;
}
