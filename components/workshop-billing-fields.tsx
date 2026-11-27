"use client";

import { Plus, Trash2 } from "lucide-react";
import { translate, type Language } from "@/lib/locale";
import { chargeLabels, chargeTypes, type ChargeType, type ImportInput } from "@/lib/workshop-charges";
import { Button } from "./ui";

export type SupplierOption = { value: string; name: string };
export type BillingValues = Record<string, unknown>;
export const emptyImport: ImportInput = { name: "", supplierId: "", quantity: "1", buyingPrice: "", sellingPrice: "" };

export function WorkshopBillingFields({ lang, values, suppliers, onChange, showImport = true, selectedCharges = chargeTypes }: {
  lang: Language; values: BillingValues; suppliers?: SupplierOption[]; showImport?: boolean;
  selectedCharges?: ChargeType[];
  onChange: (key: string, value: boolean | Partial<Record<ChargeType, string>> | ImportInput[]) => void;
}) {
  const t = (key: string) => translate(lang, key);
  const charges = (values.workshopCharges ?? {}) as Partial<Record<ChargeType, string>>;
  const imports = (values.importItems ?? []) as ImportInput[];
  function editItem(index: number, key: keyof ImportInput, value: string) {
    onChange("importItems", imports.map((item, position) => position === index ? { ...item, [key]: value } : item));
  }
  return <div className="invoice-pricing">
    {showImport && <label className="log-checkbox-option">
      <input type="checkbox" name="importRequested" checked={values.importRequested === true}
        onChange={(event) => onChange("importRequested", event.target.checked)} disabled={imports.length > 0}/><span>{t("Import")}</span>
    </label>}
    {values.importRequested === true && suppliers && <fieldset className="invoice-price-list">
      <legend>{t("Imported items")}</legend>
      {imports.map((item, index) => <div className="line-row" key={index}>
        <label className="field">{t("Product name")}<input required maxLength={240} value={item.name} onChange={(event) => editItem(index, "name", event.target.value)}/></label>
        <label className="field">{t("Supplier")}<select required value={item.supplierId} onChange={(event) => editItem(index, "supplierId", event.target.value)}>
          <option value="">{t("Select…")}</option>{suppliers.map(({ value, name }) => <option value={value} key={value}>{name}</option>)}
        </select></label>
        {([["quantity", "Quantity"], ["buyingPrice", "Buying price"], ["sellingPrice", "Selling price"]] as const).map(([key, label]) => <label className="field" key={key}>
          {t(label)}<input required dir="ltr" inputMode="decimal" maxLength={24} value={item[key]} onChange={(event) => editItem(index, key, event.target.value)}/>
        </label>)}
        <Button type="button" aria-label={t("Remove imported item")} onClick={() => onChange("importItems", imports.filter((_, position) => position !== index))}><Trash2 size={15}/></Button>
      </div>)}
      {suppliers.length === 0 && <p>{t("Add a supplier under Imports before adding an item.")}</p>}
      <Button type="button" disabled={suppliers.length === 0 || imports.length >= 30} onClick={() => onChange("importItems", [...imports, emptyImport])}><Plus size={15}/> {t("Add imported item")}</Button>
    </fieldset>}
    {selectedCharges.length > 0 && <fieldset className="invoice-price-list">
      <legend>{t("Workshop charges (EGP)")}</legend>
      {selectedCharges.map((type) => <label className="invoice-price-row" key={type}>
        <span>{t(chargeLabels[type])}</span><input name={type} dir="ltr" inputMode="decimal" maxLength={24} value={charges[type] ?? ""}
          onChange={(event) => onChange("workshopCharges", { ...charges, [type]: event.target.value })}/>
      </label>)}
    </fieldset>}
  </div>;
}
