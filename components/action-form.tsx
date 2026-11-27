"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "./navigation-link";
import { ChevronDown, Plus, Search, X } from "lucide-react";
import { Button } from "./ui";
import { day, message, money, translate, type Language } from "@/lib/locale";
import type { VisitPartInput } from "@/lib/visit-items";
import { parseMoney } from "@/lib/decimal-input";
import { requestKey } from "@/lib/request-key";
import { postFormAction, type PendingAction } from "@/lib/action-request";
import { prepareWorkshopPhotos } from "@/lib/prepare-workshop-photo";
import { uploadWorkshopPhotos } from "@/lib/upload-workshop-photos";
import { VisitPartsFields, type VisitPartOption } from "./visit-parts-fields";
import { VisitInvoiceFields, type VisitInvoicePricing, type VisitWorkshopPricing } from "./visit-invoice-fields";
import { WorkshopPhotoPicker } from "./workshop-photo-picker";
import { useDialogDismiss } from "./use-dialog-dismiss";
import { chargeTypes, type ImportInput } from "@/lib/workshop-charges";
import { requiresServicePrice } from "@/lib/services";

export type Option = { value: string; name: string; related?: string; description?: string; checkboxOnly?: boolean };
export type Field = {
  key: string; label: string; type?: "text" | "textarea" | "select" | "searchSelect" | "check" | "checkboxes" | "radio" | "date" | "tel";
  value?: string | boolean | string[]; required?: boolean; options?: Option[]; wide?: boolean; ltr?: boolean; depends?: string;
  advanced?: boolean; inputMode?: "numeric" | "decimal"; placeholder?: string; searchPlaceholder?: string; max?: string;
  helpLink?: { href: string; label: string };
  withDetails?: boolean; autoFocus?: boolean;
  suggestions?: string[]; min?: string; minFrom?: string;
};
export type ActionSpec = {
  action: "customer" | "vehicle" | "visit" | "jobIntake" | "jobUpdate" | "visitInvoice" | "visitReceipt" | "customerDebtPayment" |
    "payment" | "customerCreditApply" | "customerCreditPayout" | "reverseCustomerCredit" | "weeklyPayroll" | "employeeDismiss" | "resolvePayrollExcess" | "supplierStock" | "supplierQuote"; title: string; submitLabel?: string; fields: Field[]; hidden?: Record<string, unknown>;
  destination: string; triggerLabel?: string; relatedLink?: { field: string; owner: string; href: string; label: string };
  partOptions?: VisitPartOption[];
  partsLabel?: string;
  photos?: { label: string; limit: number };
  invoicePricing?: VisitInvoicePricing;
  workshopBilling?: VisitWorkshopPricing;
  debt?: { mode:"single"|"split"; invoices:DebtInvoice[] };
  formSummary?: { label: string; amount: string; note?: string; name?: string };
  alternate?: { when: { key: string; value: string }; destination: string; submitLabel: string };
};

type DebtInvoice={id:string;number:string;at:string;total:string;paid:string;credited:string;applied:string;balance:string};
type PendingPhotoUpload = { id: string; href: string; key: string; photos: File[] };

export function ActionForm({ lang, spec, primary = false, auto = false }: { lang: Language; spec: ActionSpec; primary?: boolean; auto?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const formDetails = useRef<HTMLDetailsElement>(null);
  const request = useRef<PendingAction | null>(null);
  const preparedPhotos = useRef<File[] | null>(null);
  const formId = useId();
  const router = useRouter();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const [searchBrowsing, setSearchBrowsing] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [working, setWorking] = useState<"Saving…" | "Preparing photos…" | "Uploading photos…" | null>(null);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [pendingUpload, setPendingUpload] = useState<PendingPhotoUpload | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [dirty, setDirty] = useState(false);
  const submitting = useRef(false);
  const busy = working !== null;
  const uncertain = Boolean(request.current?.uncertain);
  const { finish, dismiss } = useDialogDismiss(dialog,showForm,lang,dirty,busy || uncertain || Boolean(pendingUpload));
  const prices = (values.servicePrices ?? {}) as Record<string, string>;
  const t = (key: string) => translate(lang, key);
  const fields = spec.fields;
  const selectedDebt=spec.debt?.invoices.find((invoice)=>invoice.id===values.invoiceId);
  const splits=(values.debtSplit ?? {}) as Record<string,string>;
  const splitRows=spec.debt?.mode==="split" ? spec.debt.invoices.filter((invoice)=>Boolean(splits[invoice.id]?.trim())) : [];
  const alternate = spec.alternate;
  const submission = alternate && values[alternate.when.key] === alternate.when.value ? alternate : spec;

  function open() {
    setValues({ ...spec.hidden, ...Object.fromEntries(spec.fields.map((field) => [field.key, field.value ?? ""])) });
    setSearchQueries({});
    setSearchBrowsing({});
    setError("");
    setDirty(false);
    setShowForm(true);
  }
  useLayoutEffect(() => {
    if (showForm && dialog.current && !dialog.current.open) {
      dialog.current.showModal();
      dialog.current.querySelector<HTMLInputElement>("[data-autofocus]")?.focus();
    }
  }, [showForm]);
  useEffect(() => {
    if (auto && !dialog.current?.open) open();
    // An incoming action opens once on entry to this screen.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function update(key: string, value: string | boolean | string[] | Partial<Record<string, string>> | VisitPartInput[] | ImportInput[]) {
    setDirty(true);
    setValues((previous) => ({
      ...previous, [key]: value,
      ...Object.fromEntries(spec.fields.filter((field) => field.depends === key).map((field) => [field.key, ""])),
    }));
    if (!request.current?.uncertain) setError("");
  }

  function optionsFor(field: Field) {
    const options = field.options ?? [];
    const parent = field.depends;
    return parent ? options.filter((option) => option.related === values[parent]) : options;
  }

  function validate(form: HTMLFormElement) {
    if(spec.debt){
      const amount=parseMoney(values.amount);
      const splitAmounts=splitRows.map((invoice)=>parseMoney(splits[invoice.id]));
      const validSplit=splitRows.length>0 && splitRows.every((invoice,index)=>{
        const allocation=splitAmounts[index];
        return allocation!==null && allocation>0n && allocation<=BigInt(invoice.balance);
      }) && splitAmounts.reduce<bigint>((sum,value)=>sum+(value ?? 0n),0n)===amount;
      if(spec.debt.mode==="single" && !selectedDebt) {setError("selectDebtInvoice");return false;}
      if(amount===null || amount<=0n || (selectedDebt && amount>BigInt(selectedDebt.balance)) || (spec.debt.mode==="split"&&!validSplit)) {
        setError(spec.debt.mode==="split"?"amountMismatch":"debtOverpayment");return false;
      }
    }
    const invalidPrice = spec.invoicePricing?.work.find(({ service }) => {
      if (!requiresServicePrice(service)) return false;
      const price = parseMoney(prices[service]);
      return price === null || price < 0n;
    });
    if (invalidPrice) {
      setError("needServicePrices");
      form.querySelector<HTMLElement>('[name="price-' + invalidPrice.service + '"]')?.focus();
      return false;
    }
    const billingSelection = spec.workshopBilling?.selection ?? [];
    const charges = (values.workshopCharges ?? {}) as Record<string, unknown>;
    const invalidCharge = chargeTypes.find((type) => billingSelection.includes(type) && (parseMoney(charges[type]) ?? -1n) < 0n);
    if (invalidCharge) {
      setError("invalidWorkshopCharge");
      form.querySelector<HTMLElement>('[name="' + invalidCharge + '"]')?.focus();
      return false;
    }
    if (billingSelection.includes("importedItem") && !(values.importItems as ImportInput[] | undefined)?.length) {
      setError("importItemRequired");
      return false;
    }
    const missing = fields.find((field) => {
      if (!field.required) return false;
      const value = values[field.key];
      return field.type === "checkboxes" ? !Array.isArray(value) || value.length === 0 : !String(value ?? "").trim();
    });
    if (!form.checkValidity() || missing) {
      setError(missing?.type === "checkboxes" ? "needServices" : missing?.key === "paymentChannel" ? "invalidPaymentChannel" : "invalid");
      const first = missing
        ? form.querySelector<HTMLElement>('[name="' + missing.key + '"]') ?? form.querySelector<HTMLElement>('[data-search-for="' + missing.key + '"]')
        : form.querySelector<HTMLElement>(":invalid");
      first?.focus();
      return false;
    }
    return true;
  }

  function goToSavedRecord(href: string) {
    setDirty(false);
    finish(() => {
      router.push(href);
      router.refresh();
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || (!pendingUpload && !validate(event.currentTarget))) return;
    if (spec.action==="resolvePayrollExcess" && values.resolution==="waive" && !uncertain &&
      !window.confirm(t("Waive this excess deduction?"))) return;
    submitting.current=true;
    setWorking(pendingUpload ? "Uploading photos…" : photoFiles.length && !preparedPhotos.current ? "Preparing photos…" : "Saving…");
    setError("");
    try {
      let upload = pendingUpload;
      if (!upload) {
        const body = JSON.stringify(spec.debt?.mode==="split"
          ? {...values,allocations:splitRows.map((invoice)=>({documentId:invoice.id,amount:splits[invoice.id]}))}
          : values);
        if (photoFiles.length && !preparedPhotos.current) {
          try {
            preparedPhotos.current = await prepareWorkshopPhotos(photoFiles);
          } catch {
            setError("invalidPhoto");
            return;
          }
        }
        setWorking("Saving…");
        const { ok, data: result } = await postFormAction(spec.action, body, request);
        if (!ok) {
          if (result.error === "lowerMileage" && formDetails.current) formDetails.current.open = true;
          setError(result.error ?? "serverError");
          return;
        }
        const target = new URL(submission.destination.replace("$id", encodeURIComponent(result.id)), window.location.origin);
        target.searchParams.set("saved", result.warning === "duplicateParty" ? "duplicate" : "1");
        const href = target.pathname + target.search + target.hash;
        if (!preparedPhotos.current?.length) {
          goToSavedRecord(href);
          return;
        }
        upload = { id: result.id, href, key: requestKey(), photos: preparedPhotos.current };
        setPendingUpload(upload);
      }
      setWorking("Uploading photos…");
      const failure = await uploadWorkshopPhotos(upload.id, upload.photos, upload.key);
      if (failure) setError(failure);
      else goToSavedRecord(upload.href);
    } catch {
      setError("network");
    } finally { submitting.current=false;setWorking(null); }
  }

  function renderField(field: Field) {
    if (field.type === "radio") {
      return <fieldset key={field.key} className="field wide log-checkbox-field">
        <legend>{t(field.label)}{field.required && <em aria-hidden="true">*</em>}</legend>
        <div className="log-checkbox-options">
          {optionsFor(field).map((option) => <label key={option.value} className="log-checkbox-option job-type-option">
            <input type="radio" name={field.key} value={option.value} required={field.required}
              checked={values[field.key] === option.value} onChange={() => update(field.key, option.value)}/>
            <span>{option.name}{option.description && <small>{t(option.description)}</small>}</span>
          </label>)}
        </div>
      </fieldset>;
    }
    if (field.type === "checkboxes") {
      const current = values[field.key];
      const selected = Array.isArray(current) ? current : [];
      const details = (values.serviceDetails ?? {}) as Record<string, string>;
      const options = optionsFor(field);
      return <fieldset key={field.key} className="field wide log-checkbox-field">
        <legend><span>{t(field.label)}{field.required && <em aria-hidden="true">*</em>}</span></legend>
        <div className="log-checkbox-options">
          {options.map((option) => <label key={option.value} className="log-checkbox-option">
            <input type="checkbox" name={field.key} value={option.value} checked={selected.includes(option.value)}
              onChange={(event) => update(field.key, event.target.checked ? [...selected, option.value] : selected.filter((value) => value !== option.value))}/>
            <span>{option.name}</span>
          </label>)}
        </div>
        {field.withDetails && options.filter((option) => !option.checkboxOnly && selected.includes(option.value)).map((option) => {
          const id = formId + "-" + option.value;
          return <div key={option.value} className="field log-service-detail">
            <label htmlFor={id}>{t("Details for {service}").replace("{service}", option.name)}</label>
            <textarea id={id} rows={2} dir="auto" maxLength={2000} value={details[option.value] ?? ""}
              onChange={(event) => update("serviceDetails", { ...details, [option.value]: event.target.value })}/>
          </div>;
        })}
      </fieldset>;
    }
    let control: ReactNode;
    if (field.type === "searchSelect") {
      const selected = String(values[field.key] ?? "");
      const query = searchQueries[field.key] ?? "";
      const browsing = searchBrowsing[field.key] ?? false;
      const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const options = optionsFor(field);
      const showResults = browsing || terms.length > 0;
      const matches = showResults ? options.filter((option) => terms.every((term) => option.name.toLowerCase().includes(term))) : [];
      const selectedOption = options.find((option) => option.value === selected);
      const resultsId = formId + "-" + field.key + "-results";
      const hint = field.searchPlaceholder ?? "Search";
      const choose = (value: string) => {
        update(field.key, value);
        setSearchQueries((previous) => ({ ...previous, [field.key]: "" }));
        setSearchBrowsing((previous) => ({ ...previous, [field.key]: false }));
      };
      control = <div key={field.key} className={"field" + (field.wide ? " wide" : "")}>
        <span>{t(field.label)}{field.required && <em aria-hidden="true">*</em>}</span>
        {selectedOption && <div className="log-search-choice">
          <span className="log-part-choice"><bdi>{selectedOption.name}</bdi></span>
          <button type="button" className="icon-button" aria-label={t("Remove customer")} onClick={() => {
            update(field.key, "");
            setSearchBrowsing((previous) => ({ ...previous, [field.key]: true }));
          }}><X size={17}/></button>
        </div>}
        <div className="log-part-picker">
          <div className="log-search">
            <Search size={16} aria-hidden="true"/>
            <input type="search" autoComplete="off" dir="auto" data-search-for={field.key} aria-label={t(hint)}
              placeholder={t(hint)} value={query}
              onChange={(event) => setSearchQueries((previous) => ({ ...previous, [field.key]: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                event.preventDefault();
                if (matches.length === 1) choose(matches[0].value);
              }}/>
          </div>
          <Button type="button" aria-expanded={showResults} aria-controls={resultsId} onClick={() => {
            setSearchQueries((previous) => ({ ...previous, [field.key]: "" }));
            setSearchBrowsing((previous) => ({ ...previous, [field.key]: !showResults }));
          }}>{showResults ? <X size={14} aria-hidden="true"/> : <Plus size={14} aria-hidden="true"/>}
            {t(showResults ? "Hide customers" : "Choose customer")}
          </Button>
        </div>
        <div id={resultsId} hidden={!showResults}>
          {matches.length > 0 ? <ul className="log-part-results">{matches.map((option) => <li key={option.value}>
            <button type="button" className="log-part-choice" onClick={() => choose(option.value)}><bdi>{option.name}</bdi></button>
          </li>)}</ul> : <p role="status">{t("No matching customers")}</p>}
        </div>
      </div>;
    } else {
      const value = String(values[field.key] ?? "");
      const props = { name: field.key, required: field.required, dir: field.ltr ? "ltr" : "auto" };
      const listId = field.suggestions?.length ? formId + "-" + field.key + "-suggestions" : undefined;
      control = <label key={field.key} className={"field" + (field.wide ? " wide" : "") + (field.type === "check" ? " check" : "")}>
        <span>{t(field.label)}{field.required && <em aria-hidden="true">*</em>}</span>
        {field.type === "textarea" ? <textarea {...props} rows={3} value={value} onChange={(event) => update(field.key, event.target.value)}/> :
          field.type === "select" ? <select {...props} value={value} disabled={Boolean(field.depends && !values[field.depends])} onChange={(event) => update(field.key, event.target.value)}>
            <option value="">{t(field.depends && !values[field.depends] ? "Choose a customer first" : "Select…")}</option>
            {optionsFor(field).map((option) => <option key={option.value} value={option.value}>{option.name}</option>)}
          </select> :
          field.type === "check" ? <input type="checkbox" checked={values[field.key] === true} onChange={(event) => update(field.key, event.target.checked)}/> :
          <input {...props} type={field.type ?? "text"} min={field.minFrom ? String(values[field.minFrom] ?? "") : field.min} max={field.max} list={listId}
            inputMode={field.inputMode} autoComplete={field.type==="tel"?"tel":undefined}
            data-autofocus={field.autoFocus || undefined} placeholder={field.placeholder ? t(field.placeholder) : undefined}
            value={value} onChange={(event) => update(field.key, event.target.value)}/>}
        {listId && <datalist id={listId}>{field.suggestions?.map((name) => <option key={name} value={name}/>)}</datalist>}
      </label>;
    }
    const related = spec.relatedLink;
    const owner = related && values[related.owner];
    const help = related?.field === field.key && typeof owner === "string" && owner
      ? { href: related.href.replace("$id", encodeURIComponent(owner)), label: related.label }
      : field.helpLink;
    if (!help || working || request.current?.uncertain) return control;
    return <div className={"log-field-help" + (field.wide ? " wide" : "")} key={field.key}>
      {control}
      <Link className="log-related-link" href={help.href} onNavigate={(event) => {event.preventDefault();dismiss(()=>router.push(help.href));}}>
        <Plus size={15} aria-hidden="true"/>{t(help.label)}
      </Link>
    </div>;
  }

  const advanced = fields.filter((field) => field.advanced);
  return <>
    <Button type="button" variant={primary ? "primary" : "secondary"} onClick={open}>{primary && <Plus size={16}/>} {t(spec.triggerLabel ?? spec.title)}</Button>
    <dialog className="dialog log-dialog" ref={dialog} aria-label={t(spec.title)}
      onClose={() => {
        if (dialog.current?.open) return;
        setShowForm(false);
        setPhotoFiles([]);
        preparedPhotos.current = null;
        setPendingUpload(null);
      }}
      onCancel={(event) => { event.preventDefault();dismiss(); }}>
      {showForm && <form onSubmit={submit} noValidate>
        <header className="dialog-head"><h2>{t(spec.title)}</h2>
          <button className="icon-button" type="button" disabled={busy || uncertain || Boolean(pendingUpload)} aria-label={t("Close")} onClick={()=>dismiss()}><X size={21}/></button>
        </header>
        <div className="dialog-body">
          {working && <p className="sr-only" role="status">{t(working)}</p>}
          {pendingUpload ? <p className="notice" role="status">{t("Job saved. You can retry the photo upload or continue.")}</p> :
            <div className="contents" inert={busy||uncertain}>
              {spec.formSummary && <div className="payment-form-summary">
                {spec.formSummary.name && <strong className="payment-summary-customer"><bdi>{spec.formSummary.name}</bdi></strong>}
                <div><strong>{t(spec.formSummary.label)}</strong><bdi>{spec.formSummary.amount}</bdi></div>
                {spec.formSummary.note && <p>{t(spec.formSummary.note)}</p>}
              </div>}
              {spec.invoicePricing && <VisitInvoiceFields lang={lang} pricing={spec.invoicePricing} prices={prices}
                discount={String(values.invoiceDiscount ?? "")} onDiscountChange={(next)=>update("invoiceDiscount",next)}
                onChange={(next) => update("servicePrices", next)} billing={spec.workshopBilling}
                values={values} onBillingChange={update}/>}
              {spec.debt?.mode==="single" && <div className="form-grid">{fields.filter((field)=>field.key==="invoiceId").map(renderField)}</div>}
              {selectedDebt && <dl className="visit-billing-totals">
                <div><dt>{t("Invoice")}</dt><dd><bdi>{selectedDebt.number}</bdi></dd></div>
                <div><dt>{t("Date")}</dt><dd><bdi>{day(lang,selectedDebt.at)}</bdi></dd></div>
                <div><dt>{t("Invoice total")}</dt><dd><bdi>{money(lang,selectedDebt.total)}</bdi></dd></div>
                <div><dt>{t("Previously paid")}</dt><dd><bdi>{money(lang,selectedDebt.paid)}</bdi></dd></div>
                {BigInt(selectedDebt.credited)>0n&&<div><dt>{t("Credits issued")}</dt><dd><bdi>{money(lang,selectedDebt.credited)}</bdi></dd></div>}
                {BigInt(selectedDebt.applied)>0n&&<div><dt>{t("Applied customer credit")}</dt><dd><bdi>{money(lang,selectedDebt.applied)}</bdi></dd></div>}
                <div><dt>{t("Remaining debt")}</dt><dd><bdi>{money(lang,selectedDebt.balance)}</bdi></dd></div>
              </dl>}
              {spec.debt?.mode==="split" && <fieldset className="invoice-price-list"><legend>{t("Allocate payment")}</legend>
                {spec.debt.invoices.map((invoice)=><label className="invoice-price-row" key={invoice.id}><span><bdi>{invoice.number}</bdi> · <bdi>{money(lang,invoice.balance)}</bdi></span>
                  <input dir="ltr" inputMode="decimal" value={splits[invoice.id] ?? ""} onChange={(event)=>update("debtSplit",{...splits,[invoice.id]:event.target.value})}/></label>)}
              </fieldset>}
              <div className="form-grid">{fields.filter((field) => !field.advanced && (!spec.debt || field.key!=="invoiceId")).map(renderField)}</div>
              {spec.partOptions && <VisitPartsFields lang={lang} options={spec.partOptions} legend={spec.partsLabel} parts={(values.parts ?? []) as VisitPartInput[]}
                onChange={(parts) => update("parts", parts)}/>}
              {advanced.length > 0 && <details className="log-optional" ref={formDetails}>
                <summary>{t("More details")}<ChevronDown size={16}/></summary>
                <div className="form-grid">{advanced.map(renderField)}</div>
              </details>}
              {spec.photos && <fieldset className="log-job-photos">
                <legend>{t(spec.photos.label)}</legend>
                {spec.photos.limit > 0 ? <WorkshopPhotoPicker lang={lang} limit={spec.photos.limit} selection={photoFiles} disabled={busy || uncertain}
                  onLimit={() => setError("photoLimit")} onChange={(files) => {
                    preparedPhotos.current = null;
                    setDirty(true);
                    setPhotoFiles(files);
                    setError("");
                  }}/> : <span className="workshop-photo-hint">{t("Photo limit reached")}</span>}
              </fieldset>}
            </div>}
          {error && <p className="error" role="alert">{message(lang, error)}</p>}
        </div>
        <footer className="dialog-foot">
          {pendingUpload
            ? <Button type="button" disabled={busy} onClick={() => goToSavedRecord(pendingUpload.href)}>{t("Continue")}</Button>
            : <Button type="button" disabled={busy || uncertain} onClick={()=>dismiss()}>{t("Cancel")}</Button>}
          <Button type="submit" variant="primary" disabled={busy}>{t(working ?? (pendingUpload ? "Retry photo upload" : uncertain ? "Try again" : submission.submitLabel ?? "Save"))}</Button>
        </footer>
      </form>}
    </dialog>
  </>;
}

