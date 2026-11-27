import type { ReactNode } from "react";
import { label, money, translate, type Language } from "@/lib/locale";
import { describedInvoiceWork, isItemizedVisitInvoice, visitWork } from "@/lib/visit-items";
import { VisitServiceDescription, VisitWorkList } from "./visit-work-list";
import { chargeLabels, isChargeType } from "@/lib/workshop-charges";
import { StickyTable } from "./sticky-table";

export function DocumentTable({ headers, rows, lang, scroll = false }: { headers: string[]; rows: ReactNode[][]; lang: Language; scroll?: boolean }) {
  const table = <table><thead><tr>{headers.map((key) => <th key={key} scope="col">{translate(lang, key)}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, i) => <td key={i}><bdi>{cell}</bdi></td>)}</tr>)}</tbody></table>;
  return scroll ? <StickyTable lang={lang}>{table}</StickyTable> : table;
}

type Bill = {
  kind: string; category: string; metadata: unknown;
  lines: { kind: string; purpose?: string | null; description: string; position: number; quantity: { toString(): string }; price: string | bigint; discount: string | bigint; total: string | bigint }[];
};

export function invoiceLineType(lang: Language, line: Pick<Bill["lines"][number], "kind" | "purpose">) {
  if (line.purpose === "importedItem") return translate(lang, "Import");
  if (line.kind === "part") return translate(lang, "Spare parts");
  if (line.kind === "labor") return translate(lang, "Labor");
  return label(lang, line.kind);
}

export function BillItems({ lang, bill, scroll = false }: { lang: Language; bill: Bill; scroll?: boolean }) {
  const work = bill.kind === "invoice" ? visitWork(bill) : [];
  const itemized = bill.kind === "invoice" && isItemizedVisitInvoice(bill.metadata);
  const described = describedInvoiceWork(bill.metadata, work);
  const amt = (amount: string | bigint) => money(lang, amount);
  const rows = [
    ...described.map((item) => [label(lang, "service"), <VisitServiceDescription lang={lang} work={item}/>, "", "", "", ""]),
    ...bill.lines.map((row) => {
      const item = itemized && row.kind === "service" && !row.purpose ? work[row.position] : undefined;
      const description = isChargeType(row.purpose) ? translate(lang, chargeLabels[row.purpose]) : row.description;
      const type = bill.kind === "invoice" ? invoiceLineType(lang, row)
        : row.purpose === "importedItem" ? translate(lang, "Product") : label(lang, row.kind);
      return [type,
        item ? <VisitServiceDescription lang={lang} work={item}/> : description,
        String(row.quantity) === "0" ? "—" : String(row.quantity), amt(row.price), amt(row.discount), amt(row.total)];
    }),
  ];
  return <>
    {!itemized && work.length > 0 && <section className="print-work"><h2>{translate(lang, "Work done")}</h2><VisitWorkList lang={lang} work={work}/></section>}
    {rows.length > 0 && <DocumentTable lang={lang} scroll={scroll} headers={["Type", "Description", "Quantity", "Unit price", "Discount", "Total"]} rows={rows}/>}
  </>;
}
