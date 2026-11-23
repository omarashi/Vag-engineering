"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { divideHalfUp, normalize, parseMoney } from "@/lib/decimal-input";
import { message, money, translate, type Language } from "@/lib/locale";
import { requestKey } from "@/lib/request-key";
import type { VisitPartInput } from "@/lib/visit-items";
import { Button } from "./ui";
import { VisitPartsFields, type VisitPartOption } from "./visit-parts-fields";

type Customer = { id: string; name: string; phone: string };
type Part = VisitPartOption & { unitPrice: string };
type Price = { price?: string; discount?: string };

function lineTotal(quantity: string, price: string, discount: string) {
  const units = /^(\d{1,9})(?:\.(\d{1,3}))?$/.exec(normalize(quantity));
  const cost = parseMoney(price);
  const reduction = parseMoney(discount || "0");
  if (!units || cost === null || cost < 0n || reduction === null || reduction < 0n) return null;
  const thousandths = BigInt(units[1] + (units[2] ?? "").padEnd(3, "0"));
  const total = divideHalfUp(thousandths * cost, 1000n) - reduction;
  return thousandths > 0n && total >= 0n ? total : null;
}

export function CounterSaleForm({ lang, customers, options, date }: {
  lang: Language; customers: Customer[]; options: Part[]; date: string;
}) {
  const router = useRouter();
  const request = useRef<{ key: string; body: string } | null>(null);
  const [name, setName] = useState("");
  const [customer, setCustomer] = useState<Customer | "new" | null>(null);
  const [parts, setParts] = useState<VisitPartInput[]>([]);
  const [prices, setPrices] = useState<Record<string, Price>>({});
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const t = (key: string) => translate(lang, key);
  const typedName = name.trim();
  const search = typedName.toLowerCase();
  const matches = search && !customer ? customers.filter((person) => person.name.toLowerCase().includes(search)) : [];
  const exactMatches = matches.filter((person) => person.name.toLowerCase() === search);
  const suggestions = (exactMatches.length ? exactMatches : matches).slice(0, 8);
  const canUseNewName = Boolean(typedName && !customer && !exactMatches.length);
  const catalog = new Map(options.map((part) => [part.value, part]));
  const lines = parts.flatMap(({ partId, quantity }) => {
    const part = catalog.get(partId);
    return part ? [{
      kind: "part", partId, quantity, description: part.code + " · " + part.name,
      price: prices[partId]?.price ?? part.unitPrice, discount: prices[partId]?.discount ?? "",
    }] : [];
  });
  const totals = lines.map(({ quantity, price, discount }) => lineTotal(quantity, price, discount));
  const total = totals.some((value) => value === null) ? null : totals.reduce<bigint>((sum, value) => sum + (value ?? 0n), 0n);

  function selectCustomer(selection: Customer | "new", form: HTMLFormElement | null) {
    setName(selection === "new" ? typedName : selection.name);
    setCustomer(selection);
    setError("");
    form?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working) return;
    if (!request.current) {
      if (!typedName || !lines.length || total === null || exactMatches.length > 1) {
        setError(!typedName ? "invalid" : exactMatches.length > 1 ? "chooseCounterCustomer" : !lines.length ? "needLines" : "invalidCounterPrice");
        return;
      }
      const form = new FormData(event.currentTarget);
      request.current = {
        key: requestKey(),
        body: JSON.stringify({ customerName: typedName, partyId: customer === "new" ? undefined : customer?.id, lines,
          at: form.get("at"), dueAt: form.get("dueAt"), note: form.get("note") }),
      };
    }
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/actions/invoice", {
        method: "POST", body: request.current.body,
        headers: { "Content-Type": "application/json", "Idempotency-Key": request.current.key },
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status < 500) request.current = null;
        setError(result.error ?? "serverError");
        setWorking(false);
        return;
      }
      router.push("/record/" + encodeURIComponent(result.id) + "?saved=1");
      router.refresh();
    } catch {
      setError("network");
      setWorking(false);
    }
  }

  return <form className="counter-sale-form panel" onSubmit={submit} onKeyDown={(event) => {
    const field = event.target;
    if (event.defaultPrevented || event.key !== "Enter" || event.nativeEvent.isComposing || !(field instanceof HTMLInputElement)) return;
    event.preventDefault();
    if (field.name !== "customerName" || !typedName) return;
    if (exactMatches.length > 1) setError("chooseCounterCustomer");
    else selectCustomer(customer ?? exactMatches[0] ?? "new", event.currentTarget);
  }}>
    <fieldset disabled={working || Boolean(request.current)} className="counter-sale-fields">
      <div className="counter-customer">
        <label className="field"><span>{t("Customer name")} <em aria-hidden="true">*</em></span>
          <input name="customerName" required maxLength={180} autoComplete="off" enterKeyHint="next" dir="auto" value={name}
            placeholder={t("Type a new or existing name")}
            onChange={(event) => { setName(event.target.value); setCustomer(null); setError(""); }}/>
        </label>
        {canUseNewName && <div className="page-actions">
          <Button type="button" onClick={(event) => selectCustomer("new", event.currentTarget.form)}>
            {t("Use as new customer")}
          </Button>
        </div>}
        {suggestions.length > 0 && <ul className="log-part-results" aria-label={t("Matching customers")}>
          {suggestions.map((person) => <li key={person.id}>
            <button type="button" className="log-part-choice" onClick={(event) => selectCustomer(person, event.currentTarget.form)}>
              <bdi>{person.name}</bdi>{person.phone && <small><bdi>{person.phone}</bdi></small>}
            </button>
          </li>)}
        </ul>}
        {customer === "new" && <p role="status" className="counter-customer-status">{t("New customer selected")}</p>}
      </div>
      <VisitPartsFields lang={lang} parts={parts} options={options} onChange={(next) => {
        setParts(next);
        setPrices((previous) => Object.fromEntries(next.filter(({ partId }) => previous[partId]).map(({ partId }) => [partId, previous[partId]])));
        setError("");
      }}
        priceDetails={({ partId }, option) => <details className="log-optional">
          <summary>{t("Price or discount")}</summary>
          <div className="form-grid">
            <label className="field">{t("Unit price")}<input dir="ltr" inputMode="decimal"
              value={prices[partId]?.price ?? catalog.get(option.value)?.unitPrice ?? ""}
              onChange={(event) => setPrices({ ...prices, [partId]: { ...prices[partId], price: event.target.value } })}/></label>
            <label className="field">{t("Discount")}<input dir="ltr" inputMode="decimal" value={prices[partId]?.discount ?? ""}
              onChange={(event) => setPrices({ ...prices, [partId]: { ...prices[partId], discount: event.target.value } })}/></label>
          </div>
        </details>}/>
      <details className="log-optional">
        <summary>{t("More details")}</summary>
        <div className="form-grid">
          <label className="field">{t("Date")}<input name="at" type="date" dir="ltr" required defaultValue={date}/></label>
          <label className="field">{t("Due date")}<input name="dueAt" type="date" dir="ltr"/></label>
          <label className="field wide">{t("Notes")}<textarea name="note" rows={2}/></label>
        </div>
      </details>
    </fieldset>
    {error && <p className="error" role="alert">{message(lang, error)}</p>}
    <div className="invoice-price-row invoice-price-total">
      <strong>{t("Invoice total")}</strong>
      <output aria-label={t("Invoice total")}><bdi>{total === null ? "—" : money(lang, total)}</bdi></output>
    </div>
    <div className="page-actions">
      <Button type="submit" variant="primary" disabled={working}>
        {t(working ? "Saving…" : request.current ? "Try again" : "Create invoice")}
      </Button>
    </div>
  </form>;
}
