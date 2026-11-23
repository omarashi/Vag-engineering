import { db } from "@/lib/db";
import { moneyInput, translate, type Language } from "@/lib/locale";
import { supplierPriceList, supplierQuoteCode, type SupplierQuote } from "@/lib/supplier-price-list";
import { ActionForm, type ActionSpec } from "./action-form";
import { Amt, Heading, Ref, Register, Toolbar } from "./register";
import { ButtonLink, Empty, Panel } from "./ui";

function quoteForm(destination: string, item?: SupplierQuote): ActionSpec {
  return {
    action: "supplierQuote", title: item ? "Edit quote" : "Add item", destination,
    hidden: item ? { quote: supplierQuoteCode(item), quoteVersion: item.version ?? 0 } : undefined,
    fields: [
      { key: "description", label: "Description", value: item?.description, required: true, wide: true, autoFocus: true },
      { key: "brand", label: "Brand", value: item?.brand },
      { key: "cost", label: "Purchase price (EGP)", value: item?.cost.toFixed(2), inputMode: "decimal", required: true, ltr: true },
    ],
  };
}

export async function SupplierPriceList({ lang, search, fromInventory, canEdit }: {
  lang: Language; search?: string; fromInventory: boolean; canEdit: boolean;
}) {
  const list = await supplierPriceList();
  const t = (key: string) => translate(lang, key);
  const currency = list?.currency;
  const editable = canEdit && (!currency || currency === "EGP");
  const terms = (search ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  const items = (list?.items ?? []).filter(({ brand, description }) => {
    const text = `${brand} ${description}`.toLowerCase();
    return terms.every((term) => text.includes(term));
  });
  const partIds = items.flatMap(({ partId }) => partId ? [partId] : []);
  const parts = partIds.length ? await db.part.findMany({
    where: { id: { in: partIds } }, select: { id: true, price: true, version: true, archived: true },
  }) : [];
  const existing = new Map(parts.map((part) => [part.id, part]));
  const path = fromInventory ? "/inventory/price-list" : "/purchasing/price-list";
  const filteredPath = search ? path + "?" + new URLSearchParams({ q: search }) : path;
  const stockDestination = fromInventory ? "/inventory/$id" : filteredPath;
  const amount = new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-GB", currency
    ? { style: "currency", currency, currencyDisplay: "code" } : {});

  return <>
    <Heading lang={lang} title={fromInventory ? "Add from price list" : "Supplier price list"} description={list?.name}>
      {editable && <ActionForm lang={lang} spec={quoteForm(path)} primary/>}
      {fromInventory ? <ButtonLink href="/inventory">{t("Inventory")}</ButtonLink>
        : <ButtonLink href="/purchasing">{t("Suppliers & purchasing")}</ButtonLink>}
    </Heading>
    {list && <Toolbar lang={lang} path={path} filters={{ q: search }}/>}
    {list && !currency && <p className="notice">{t("The source lists amounts without a currency.")}</p>}
    <Panel title={t("Purchase prices")}>
      {list ? <Register lang={lang} head={["Brand", "Description", "Quoted purchase price", "Selling price", "Action"]} rows={items.map((item) => {
        const part = item.partId ? existing.get(item.partId) : undefined;
        const code = supplierQuoteCode(item);
        const quote = amount.format(item.cost);
        return [
          <bdi>{item.brand}</bdi>, part ? <Ref href={"/inventory/" + part.id}>{item.description}</Ref> : <bdi>{item.description}</bdi>,
          <bdi>{quote}</bdi>, <Amt lang={lang} value={part?.price}/>,
          <div key={code} className="flex flex-wrap items-center gap-2">
            {part?.archived ? t("Archived") : currency === "EGP" && (!item.partId || part) && <ActionForm lang={lang} spec={{
              action: "supplierStock", title: "Add stock", submitLabel: "Add stock", destination: stockDestination,
              hidden: { quote: code, quoteVersion: item.version ?? 0, quotedCost: item.cost, partVersion: part?.version ?? null },
              formSummary: { name: [item.brand, item.description].filter(Boolean).join(" · "), label: "Quoted purchase price", amount: quote },
              fields: [
                { key: "quantity", label: "Quantity", inputMode: "decimal", required: true, ltr: true, autoFocus: true },
                { key: "sellingPrice", label: "Selling price (EGP)", inputMode: "decimal", required: true, ltr: true, value: moneyInput(part?.price) },
              ],
            }}/>}
            {editable && <ActionForm lang={lang} spec={quoteForm(filteredPath, item)}/>}
          </div>,
        ];
      })}/> : <Empty lang={lang} text="No items on the price list yet."/>}
    </Panel>
  </>;
}
