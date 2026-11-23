import { useState } from "react";
import { translate, type Language } from "@/lib/locale";
import type { Option } from "./backoffice-form";

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
  const [query, setQuery] = useState("");
  const t = (key: string) => translate(lang, key);
  const source = row.productSource || "inventory";
  const quote = source === "quote" ? quotes.find((item) => item.value === row.quote) : undefined;
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = source === "quote" ? quotes.filter((item) => {
    const searchable = `${item.brand} ${item.description} ${item.value}`.toLowerCase();
    return terms.every((term) => searchable.includes(term));
  }) : [];
  const visible = quote && !matches.includes(quote) ? [quote, ...matches] : matches;

  function chooseSource(productSource: string) {
    setQuery("");
    onChange({ kind: "part", productSource, quantity: row.quantity, discount: "0", description: "", price: "" });
  }

  function chooseQuote(item?: PurchaseQuoteOption) {
    setQuery("");
    onChange({ ...row, quote: item?.value ?? "", quoteVersion: String(item?.version ?? 0),
      description: item?.description ?? "", price: item?.cost ?? "", sellingPrice: "" });
  }

  return <>
    <label className="field wide">{t("Product source")}
      <select value={source} onChange={(event) => chooseSource(event.target.value)}>
        <option value="inventory">{t("Existing inventory")}</option>
        <option value="manual">{t("Add manually")}</option>
        {quotes.length > 0 && <option value="quote">{t("Add from price list")}</option>}
      </select>
    </label>
    {source === "inventory" && <label className="field wide">{t("Part")}
      <select required value={row.partId ?? ""} onChange={(event) => {
        const item = parts.find(({ value }) => value === event.target.value);
        onChange({ ...row, partId: item?.value ?? "", description: item?.name ?? "", price: item?.cost ?? "" });
      }}>
        <option value="">{t("Select…")}</option>
        {parts.map((item) => <option key={item.value} value={item.value}>{item.name}</option>)}
      </select>
    </label>}
    {source === "quote" && <>
      <label className="field wide">{t("Search price list")}
        <input type="search" dir="auto" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
          event.preventDefault();
          if (matches.length === 1) chooseQuote(matches[0]);
        }}/>
      </label>
      <label className="field wide">{t("Supplier price list")}
        <select required value={row.quote ?? ""} onChange={(event) => chooseQuote(quotes.find((item) => item.value === event.target.value))}>
          <option value="">{t(matches.length ? "Select…" : "No matching parts")}</option>
          {visible.map((item) => <option key={item.value} value={item.value}>
            {[item.brand, item.description].filter(Boolean).join(" · ")}
          </option>)}
        </select>
      </label>
    </>}
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
