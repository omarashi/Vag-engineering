"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "./navigation-link";
import { ChevronDown, Plus, X } from "lucide-react";
import { Button } from "./ui";
import { message, translate, type Language } from "@/lib/locale";
import type { VisitPartInput } from "@/lib/visit-items";
import { parseMoney } from "@/lib/decimal-input";
import { requestKey } from "@/lib/request-key";
import { postFormAction, type PendingAction } from "@/lib/action-request";
import { prepareWorkshopPhotos } from "@/lib/prepare-workshop-photo";
import { uploadWorkshopPhotos } from "@/lib/upload-workshop-photos";
import { VisitPartsFields, type VisitPartOption } from "./visit-parts-fields";
import { VisitInvoiceFields, type VisitInvoicePricing } from "./visit-invoice-fields";
import { WorkshopPhotoPicker } from "./workshop-photo-picker";

export type Option = { value: string; name: string; related?: string; description?: string };
export type Field = {
  key: string; label: string; type?: "text" | "textarea" | "select" | "check" | "checkboxes" | "radio" | "date" | "tel";
  value?: string | boolean | string[]; required?: boolean; options?: Option[]; wide?: boolean; ltr?: boolean; depends?: string;
  advanced?: boolean; inputMode?: "numeric" | "decimal"; placeholder?: string; max?: string;
  helpLink?: { href: string; label: string };
  withDetails?: boolean; autoFocus?: boolean;
  suggestions?: string[]; min?: string; minFrom?: string;
  showWhen?: { key: string; value: string };
};
export type ActionSpec = {
  action: "customer" | "vehicle" | "visit" | "jobIntake" | "jobUpdate" | "visitInvoice" | "visitReceipt" | "customerDebtPayment" |
    "payment" | "weeklyPayroll" | "employeeDismiss" | "supplierStock" | "supplierQuote"; title: string; submitLabel?: string; fields: Field[]; hidden?: Record<string, unknown>;
  destination: string; triggerLabel?: string; relatedLink?: { field: string; owner: string; href: string; label: string };
  partOptions?: VisitPartOption[];
  partsLabel?: string;
  photos?: { label: string; limit: number };
  invoicePricing?: VisitInvoicePricing;
  formSummary?: { label: string; amount: string; note?: string; name?: string };
  alternate?: { when: { key: string; value: string }; destination: string; submitLabel: string };
};

type PendingPhotoUpload = { id: string; href: string; key: string; photos: File[] };

export function ActionForm({ lang, spec, primary = false, auto = false }: { lang: Language; spec: ActionSpec; primary?: boolean; auto?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const formDetails = useRef<HTMLDetailsElement>(null);
  const request = useRef<PendingAction | null>(null);
  const preparedPhotos = useRef<File[] | null>(null);
  const formId = useId();
  const router = useRouter();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState("");
  const [working, setWorking] = useState<"Saving…" | "Preparing photos…" | "Uploading photos…" | null>(null);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [pendingUpload, setPendingUpload] = useState<PendingPhotoUpload | null>(null);
  const [showForm, setShowForm] = useState(false);
  const busy = working !== null;
  const prices = (values.servicePrices ?? {}) as Record<string, string>;
  const t = (key: string) => translate(lang, key);
  const fields = spec.fields.filter(({ showWhen }) => !showWhen || values[showWhen.key] === showWhen.value);
  const alternate = spec.alternate;
  const submission = alternate && values[alternate.when.key] === alternate.when.value ? alternate : spec;

  function open() {
    setValues({ ...spec.hidden, ...Object.fromEntries(spec.fields.map((field) => [field.key, field.value ?? ""])) });
    setError("");
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

  function update(key: string, value: string | boolean | string[] | Record<string, string> | VisitPartInput[]) {
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
    const invalidPrice = spec.invoicePricing?.work.find(({ service }) => {
      const price = parseMoney(prices[service]);
      return price === null || price < 0n;
    });
    if (invalidPrice) {
      setError("needServicePrices");
      form.querySelector<HTMLElement>('[name="price-' + invalidPrice.service + '"]')?.focus();
      return false;
    }
    const missing = fields.find((field) => {
      if (!field.required) return false;
      const value = values[field.key];
      return field.type === "checkboxes" ? !Array.isArray(value) || value.length === 0 : !String(value ?? "").trim();
    });
    if (!form.checkValidity() || missing) {
      setError(missing?.type === "checkboxes" ? "needServices" : "invalid");
      const first = missing ? form.querySelector<HTMLElement>('[name="' + missing.key + '"]') : form.querySelector<HTMLElement>(":invalid");
      first?.focus();
      return false;
    }
    return true;
  }

  function goToSavedRecord(href: string) {
    dialog.current?.close();
    router.push(href);
    router.refresh();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || (!pendingUpload && !validate(event.currentTarget))) return;
    setWorking(pendingUpload ? "Uploading photos…" : photoFiles.length && !preparedPhotos.current ? "Preparing photos…" : "Saving…");
    setError("");
    try {
      let upload = pendingUpload;
      if (!upload) {
        const body = JSON.stringify(values);
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
        const href = target.pathname + target.search;
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
    } finally { setWorking(null); }
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
        {field.withDetails && options.filter((option) => selected.includes(option.value)).map((option) => {
          const id = formId + "-" + option.value;
          return <div key={option.value} className="field log-service-detail">
            <label htmlFor={id}>{t("Details for {service}").replace("{service}", option.name)}</label>
            <textarea id={id} rows={2} dir="auto" maxLength={2000} value={details[option.value] ?? ""}
              onChange={(event) => update("serviceDetails", { ...details, [option.value]: event.target.value })}/>
          </div>;
        })}
      </fieldset>;
    }
    const value = String(values[field.key] ?? "");
    const props = { name: field.key, required: field.required, dir: field.ltr ? "ltr" : "auto" };
    const listId = field.suggestions?.length ? formId + "-" + field.key + "-suggestions" : undefined;
    const control = <label key={field.key} className={"field" + (field.wide ? " wide" : "") + (field.type === "check" ? " check" : "")}>
      <span>{t(field.label)}{field.required && <em aria-hidden="true">*</em>}</span>
      {field.type === "textarea" ? <textarea {...props} rows={3} value={value} onChange={(event) => update(field.key, event.target.value)}/> :
        field.type === "select" ? <select {...props} value={value} disabled={Boolean(field.depends && !values[field.depends])} onChange={(event) => update(field.key, event.target.value)}>
          <option value="">{t(field.depends && !values[field.depends] ? "Choose a customer first" : "Select…")}</option>
          {optionsFor(field).map((option) => <option key={option.value} value={option.value}>{option.name}</option>)}
        </select> :
        field.type === "check" ? <input type="checkbox" checked={values[field.key] === true} onChange={(event) => update(field.key, event.target.checked)}/> :
        <input {...props} type={field.type ?? "text"} min={field.minFrom ? String(values[field.minFrom] ?? "") : field.min} max={field.max} list={listId}
          inputMode={field.inputMode} data-autofocus={field.autoFocus || undefined} placeholder={field.placeholder ? t(field.placeholder) : undefined}
          value={value} onChange={(event) => update(field.key, event.target.value)}/>}
      {listId && <datalist id={listId}>{field.suggestions?.map((name) => <option key={name} value={name}/>)}</datalist>}
    </label>;
    const related = spec.relatedLink;
    const owner = related && values[related.owner];
    const help = related?.field === field.key && typeof owner === "string" && owner
      ? { href: related.href.replace("$id", encodeURIComponent(owner)), label: related.label }
      : field.helpLink;
    if (!help || working || request.current?.uncertain) return control;
    return <div className={"log-field-help" + (field.wide ? " wide" : "")} key={field.key}>
      {control}
      <Link className="log-related-link" href={help.href} onClick={() => dialog.current?.close()}>
        <Plus size={15} aria-hidden="true"/>{t(help.label)}
      </Link>
    </div>;
  }

  const advanced = fields.filter((field) => field.advanced);
  const uncertain = Boolean(request.current?.uncertain);

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
      onCancel={(event) => { if (busy || uncertain || pendingUpload) event.preventDefault(); }}>
      {showForm && <form onSubmit={submit} noValidate>
        <header className="dialog-head"><h2>{t(spec.title)}</h2>
          <button className="icon-button" type="button" disabled={busy || uncertain || Boolean(pendingUpload)} aria-label={t("Close")} onClick={() => dialog.current?.close()}><X size={21}/></button>
        </header>
        <div className="dialog-body">
          {pendingUpload ? <p className="notice" role="status">{t("Job saved. You can retry the photo upload or continue.")}</p> :
            <div className="contents" inert={busy}>
              {spec.formSummary && <div className="payment-form-summary">
                {spec.formSummary.name && <strong className="payment-summary-customer"><bdi>{spec.formSummary.name}</bdi></strong>}
                <div><strong>{t(spec.formSummary.label)}</strong><bdi>{spec.formSummary.amount}</bdi></div>
                {spec.formSummary.note && <p>{t(spec.formSummary.note)}</p>}
              </div>}
              {spec.invoicePricing && <VisitInvoiceFields lang={lang} pricing={spec.invoicePricing} prices={prices}
                onChange={(next) => update("servicePrices", next)}/>}
              <div className="form-grid">{fields.filter((field) => !field.advanced).map(renderField)}</div>
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
            : <Button type="button" disabled={busy || uncertain} onClick={() => dialog.current?.close()}>{t("Cancel")}</Button>}
          <Button type="submit" variant="primary" disabled={busy}>{t(working ?? (pendingUpload ? "Retry photo upload" : uncertain ? "Try again" : submission.submitLabel ?? "Save"))}</Button>
        </footer>
      </form>}
    </dialog>
  </>;
}

