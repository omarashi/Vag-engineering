import type { Document, Party, Vehicle } from "@prisma/client";
import type { ActionSpec, Field, Option } from "@/components/action-form";
import type { VisitPartOption } from "@/components/visit-parts-fields";
import { money, moneyInput, translate, type Language } from "./locale";
import { db } from "./db";
import { selectableServices, serviceName, serviceTypes, visitServiceTypes } from "./services";
import { jobModeLabel, jobModes, visitParts, visitWork, workshopIntake } from "./visit-items";
import { today } from "./rules";
import { recordedDeliveryDate } from "./visits";
import { carName } from "./car-name";
import { workshopPhotoLimit } from "./workshop-photo-limits";
import { receiptDestinations } from "./payment-options";

const field = (key: string, label: string, value = "", options: Partial<Field> = {}): Field => ({ key, label, value, ...options });
const pick = (key: string, label: string, value: string, options: Option[], more: Partial<Field> = {}) =>
  field(key, label, value, { options, required: true, type: "select", ...more });
const version = (row?: { id: string; version: number }) => row ? { id: row.id, version: row.version } : {};

export function receiptAccounts() {
  return db.moneyAccount.findMany({ where: { archived: false }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true, kind: true } });
}

export function receiptFields(lang: Language, accounts: Awaited<ReturnType<typeof receiptAccounts>>, quick = false): Field[] {
  const {options,initial}=receiptDestinations(lang,accounts);
  return [
    pick("receiptDestination", "Receive payment via", initial, options, { wide:true }),
    field("amount", "Amount paid (EGP)", "", { inputMode:"decimal", ltr:true, required:true, autoFocus:quick }),
    field("at", "Payment date", today(), { type: "date", ltr: true, required: true, max: today(), advanced: true }),
    field("note", "Notes", "", { advanced: true, type: "textarea", wide: true }),
  ];
}

export function invoiceReceiptForm(lang: Language, invoice: { id: string; at: Date | string }, balance: bigint,
  accounts: Awaited<ReturnType<typeof receiptAccounts>>): ActionSpec {
  const fields = receiptFields(lang, accounts);
  return {
    action: "payment", title: "Record a receipt", submitLabel: "Save receipt", destination: "/payment/$id",
    hidden: { kind: "receipt", invoiceId: invoice.id },
    formSummary: { label: "Amount due", amount: money(lang, balance) },
    fields: fields.map((item) => item.key === "amount"
      ? { ...item, value: moneyInput(balance), autoFocus: true }
      : item.key === "at" ? { ...item, min: today(invoice.at) } : item),
  };
}

export function customerDebtForm(lang: Language, partyId: string, balance: bigint, accounts: Awaited<ReturnType<typeof receiptAccounts>>,
  customer?: { name: string; destination: string }): ActionSpec {
  return {
    action: "customerDebtPayment", title: "Record a debt payment",
    triggerLabel: customer ? "Record payment" : undefined,
    submitLabel: customer ? "Save payment" : "Save and open receipt",
    destination: customer?.destination ?? "/payment/$id",
    hidden: { partyId }, fields: receiptFields(lang, accounts, Boolean(customer)),
    formSummary: {
      label: "Outstanding balance", amount: money(lang, balance), name: customer?.name,
      note: customer ? undefined : "Payments cover the oldest balances first.",
    },
  };
}

export const newCustomerForJob = "/customers?new=customer&next=job";
export const newCustomerLabel = "New customer? Add them here";

export function customerForm(row?: Party, continueVisit = false): ActionSpec {
  return {
    action: "customer", title: row ? "Edit customer" : "Add customer", hidden: version(row),
    destination: continueVisit && !row ? "/customers/$id?new=vehicle&next=job" : "/customers/$id",
    fields: [
      field("name", "Full name", row?.name, { required: true, wide: true }),
      field("phone", "Mobile number", row?.phone, { type: "tel", ltr: true, wide: true }),
      field("note", "Notes", row?.note, { type: "textarea", wide: true }),
      field("contact", "Other contact", row?.contact, { advanced: true }),
      field("address", "Address", row?.address, { advanced: true }),
      ...(row ? [field("archived", "Archived", "", { type: "check", value: row.archived, advanced: true })] : []),
    ],
  };
}

export function carForm({ row, customerId, customers, continueVisit = false }: {
  row?: Vehicle; customerId?: string; customers: Option[]; continueVisit?: boolean;
}): ActionSpec {
  const owner = customerId ?? row?.partyId;
  return {
    action: "vehicle", title: row ? "Edit car" : "Add car",
    destination: continueVisit && !row ? "/vehicles/$id?new=job" : "/vehicles/$id",
    hidden: { ...version(row), ...(owner ? { partyId: owner } : {}) },
    fields: [
      ...(!owner ? [pick("partyId", "Customer", "", customers, { wide: true })] : []),
      field("make", "Brand", row?.make, { wide: true }),
      field("model", "Model", row?.model, { required: true }),
      field("color", "Color", row?.color),
      field("plate", "Plate number", row?.plate, { wide: true }),
      field("note", "Notes", row?.note, { type: "textarea", wide: true }),
      field("year", "Model year", String(row?.year ?? ""), { advanced: true, ltr: true, inputMode: "numeric" }),
      field("mileage", "Odometer (km)", String(row?.mileage ?? ""), { advanced: true, ltr: true, inputMode: "numeric" }),
      field("stage", "Tuning stage", row?.stage, { advanced: true }),
      field("vin", "VIN", row?.vin ?? "", { advanced: true, ltr: true }),
      field("engine", "Engine code", row?.engine, { advanced: true, ltr: true }),
      field("transmission", "Transmission", row?.transmission, { advanced: true }),
      ...(row ? [
        field("reason", "Reason for mileage change", "", { advanced: true }),
        field("archived", "Archived", "", { type: "check", value: row.archived, advanced: true }),
      ] : []),
    ],
  };
}

export async function visitPartOptions(lang: Language) {
  const parts = await db.part.findMany({
    where: { archived: false, onHand: { gt: 0 } },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, price: true },
  });
  return parts.map((part) => ({ value: part.id, name: part.name, code: part.code, price: money(lang, part.price), unitPrice: moneyInput(part.price) }));
}

export function activeCustomers() {
  return db.party.findMany({
    where: { kind: "customer", archived: false }, orderBy: { name: "asc" }, select: { id: true, name: true, phone: true },
  });
}

export async function customerChoices() {
  const customers = await activeCustomers();
  return customers.map(({ id, name, phone }) => ({ value: id, name: [name, phone].filter(Boolean).join(" · ") }));
}

export async function jobCarChoices() {
  const cars = await db.vehicle.findMany({
    where: { archived: false, party: { kind: "customer", archived: false } },
    select: { id: true, make: true, model: true, color: true, plate: true, partyId: true }, orderBy: { model: "asc" },
  });
  return cars.map((car) => ({
    value: car.id, related: car.partyId, name: [carName(car), car.plate].filter(Boolean).join(" · "),
  }));
}

export async function receiverSuggestions() {
  const workers = await db.employee.findMany({
    where: { archived: false }, orderBy: { name: "asc" }, select: { name: true },
  });
  return [...new Set(workers.map(({ name }) => name))];
}

export function jobProgressForm(row: Document, mayTakePayment: boolean, photoSlots?: number): ActionSpec {
  return {
    action: "jobUpdate", title: "Finish job",
    submitLabel: mayTakePayment ? "Save and take payment" : "Save delivery date",
    hidden: { ...version(row), status: "delivered" },
    destination: "/jobs/$id" + (mayTakePayment ? "?new=receipt" : ""),
    ...(photoSlots !== undefined && { photos: { label: "Delivery photos (optional)", limit: photoSlots } }),
    fields: [field("deliveryDate", "Delivery date", today(), {
      type: "date", required: true, ltr: true, min: today(row.at), max: today(), wide: true,
    })],
  };
}

export function jobForm(lang: Language, { row, customerId, carId, customers = [], cars = [], partOptions, receivers = [], mayTakePayment = false, photosEnabled = false }: {
  row?: Document; customerId?: string; carId?: string; customers?: Option[]; cars?: Option[]; partOptions?: VisitPartOption[]; receivers?: string[];
  mayTakePayment?: boolean;
  photosEnabled?: boolean;
} = {}): ActionSpec {
  const mileage = (row?.metadata as { mileage?: number } | undefined)?.mileage;
  const savedServices = row ? visitServiceTypes(row) : [];
  const choices = savedServices.includes("repair") ? serviceTypes : selectableServices;
  const serviceOptions = choices.map((value) => ({ value, name: serviceName(lang, value) }));
  const selecting = !row && !carId;
  const parts = visitParts(row?.metadata);
  const existing = new Set(parts.map((part) => part.partId));
  const availableParts = new Set(partOptions?.map((part) => part.value));
  const intake = workshopIntake(row?.metadata);
  const receiverOptions = receivers.map((name) => ({ value: name, name }));
  if (intake?.receivedBy && !receiverOptions.some((option) => option.value === intake.receivedBy)) {
    receiverOptions.unshift({ value: intake.receivedBy, name: intake.receivedBy });
  }
  const legacy = row?.kind === "visit";
  const closed = row?.status === "delivered";
  const canChangeType = !legacy && !closed;
  const jobMode = intake?.jobMode ?? "";
  return {
    partsLabel: "Parts used",
    action: legacy ? "visit" : "jobIntake", title: row ? "Edit job" : "New job", destination: "/jobs/$id",
    ...(!row ? { submitLabel: "Save job" } : {}),
    ...(!row && photosEnabled && { photos: { label: "Check-in photos (optional)", limit: workshopPhotoLimit } }),
    ...(mayTakePayment && canChangeType ? { alternate: {
      when: { key: "jobMode", value: "quick" }, submitLabel: "Save and take payment", destination: "/jobs/$id?new=receipt",
    } } : {}),
    hidden: {
      ...version(row), ...(customerId ? { partyId: customerId } : {}), ...(carId ? { vehicleId: carId } : {}),
      ...(!legacy ? { jobMode } : {}),
      serviceDetails: Object.fromEntries(row ? visitWork(row).map(({ service, detail }) => [service, detail]) : []),
      ...(partOptions ? { parts: parts.map(({ partId, quantity }) => ({ partId, quantity })) } : {}),
    },
    ...(partOptions ? {
      partOptions: [
        ...partOptions.filter((part) => !existing.has(part.value)).map(({ value, name, code, price }) =>
          ({ value, name, code, ...(mayTakePayment && { price }) })),
        ...parts.map((part) => ({ value: part.partId, name: part.name, code: part.code,
          ...(mayTakePayment && { price: money(lang, part.unitPrice) }), unavailable: !availableParts.has(part.partId) })),
      ],
    } : {}),
    ...(selecting ? { relatedLink: { field: "vehicleId", owner: "partyId", href: "/customers/$id?new=vehicle&next=job", label: "Add a car for this customer" } } : {}),
    fields: [
      ...(selecting && !customerId ? [pick("partyId", "Customer", "", customers, {
        type: "searchSelect", searchPlaceholder: "Search by customer name or phone",
        helpLink: { href: newCustomerForJob, label: newCustomerLabel },
      })] : []),
      ...(selecting ? [pick("vehicleId", "Car", "", cars, { depends: "partyId" })] : []),
      ...(!legacy ? [
        ...(canChangeType ? [field("jobMode", "Job type", jobMode, {
          type: "radio", required: true,
          options: jobModes.map((value) => ({
            value, name: translate(lang, jobModeLabel(value)),
            description: value === "quick" ? "Finished the same day" : "Save as in progress",
          })),
        })] : []),
        field("receivedBy", "Received by", intake?.receivedBy, {
          required: true, type: "select", options: receiverOptions,
        }),
      ] : []),
      field("at", "Date received", today(row?.at), { type: "date", required: true, ltr: true, max: today() }),
      ...(row && closed && intake?.jobMode === "stay" ? [field("deliveryDate", "Delivery date", recordedDeliveryDate(row), {
        type: "date", ltr: true, minFrom: "at", max: today(), required: true,
      })] : []),
      { key: "services", label: "Services", type: "checkboxes", withDetails: true, required: true, wide: true, options: serviceOptions, value: savedServices },
      field("note", "Notes", row?.note, { type: "textarea", wide: true }),
      field("mileage", "Odometer (km)", String(mileage ?? ""), { advanced: true, ltr: true, inputMode: "numeric" }),
    ],
  };
}

