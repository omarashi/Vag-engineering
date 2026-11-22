import type { ReactNode } from "react";
import { label, money, translate, type Language } from "@/lib/locale";
import { isItemizedVisitInvoice, visitWork } from "@/lib/visit-items";
import { VisitServiceDescription, VisitWorkList } from "./visit-work-list";

export function DocumentTable({ headers, rows, lang }: { headers: string[]; rows: ReactNode[][]; lang: Language }) {
  return <table><thead><tr>{headers.map((key) => <th key={key} scope="col">{translate(lang, key)}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, i) => <td key={i}><bdi>{cell}</bdi></td>)}</tr>)}</tbody></table>;
}

type Bill = {
  kind: string; category: string; metadata: unknown;
  lines: { kind: string; description: string; position: number; quantity: { toString(): string }; price: string | bigint; discount: string | bigint; total: string | bigint }[];
};

export function BillItems({ lang, bill }: { lang: Language; bill: Bill }) {
  const work = bill.kind === "invoice" ? visitWork(bill) : [];
  const itemized = bill.kind === "invoice" && isItemizedVisitInvoice(bill.metadata);
  const amt = (amount: string | bigint) => money(lang, amount);
  return <>
    {!itemized && work.length > 0 && <section className="print-work"><h2>{translate(lang, "Work done")}</h2><VisitWorkList lang={lang} work={work}/></section>}
    {bill.lines.length > 0 && <DocumentTable lang={lang} headers={["Type", "Description", "Quantity", "Unit price", "Discount", "Total"]}
      rows={bill.lines.map((row) => {
        const item = itemized && row.kind === "service" ? work[row.position] : undefined;
        return [label(lang, row.kind), item ? <VisitServiceDescription lang={lang} work={item}/> : row.description,
          String(row.quantity), amt(row.price), amt(row.discount), amt(row.total)];
      })}/>}
  </>;
}
