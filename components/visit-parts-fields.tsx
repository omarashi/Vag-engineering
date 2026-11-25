import { useId, useRef, useState, type ReactNode } from "react";
import { Plus, Search, X } from "lucide-react";
import type { VisitPartInput } from "@/lib/visit-items";
import { translate, type Language } from "@/lib/locale";
import { Button } from "./ui";

export type VisitPartOption = { value: string; name: string; code: string; price?: string; unavailable?: boolean };

export function VisitPartsFields({ lang, options, parts, onChange, priceDetails, legend = "Parts sold" }: {
  lang: Language; options: VisitPartOption[]; parts: VisitPartInput[]; onChange: (parts: VisitPartInput[]) => void;
  priceDetails?: (part: VisitPartInput, option: VisitPartOption) => ReactNode;
  legend?: string;
}) {
  const [query, setQuery] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const resultsId = useId();
  const t = (key: string) => translate(lang, key);
  const chosen = new Set(parts.map((part) => part.partId));
  const catalog = new Map(options.map((option) => [option.value, option]));
  const inStock = options.filter((option) => !option.unavailable);
  const available = inStock.filter((option) => !chosen.has(option.value));
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const showResults = browsing || terms.length > 0;
  const normalize = (value: string) => value.replace(/[\s\-_]/g, "").toLowerCase();
  const matches = showResults ? available.filter((option) => {
    const nameAndCode = normalize(option.name + " " + option.code);
    return terms.every((term) => nameAndCode.includes(normalize(term)));
  }) : [];

  function addPart(option: VisitPartOption) {
    onChange([...parts, { partId: option.value, quantity: "1" }]);
    setQuery("");
    setBrowsing(false);
    searchInput.current?.focus();
  }

  return <fieldset className="log-part-fields">
    <legend>{t(legend)}</legend>
    {parts.map((part) => {
      const option = catalog.get(part.partId);
      return <div key={part.partId} className="log-part-fields-row">
        <span className="log-part-choice"><bdi>{option?.name}</bdi>
          <small><bdi>{option?.code}</bdi>{option?.price && <> · <bdi>{option.price}</bdi></>}</small>
        </span>
        <label className="field"><span>{t("Quantity")}</span>
          <input required inputMode="decimal" dir="ltr" value={part.quantity}
            onChange={(event) => onChange(parts.map((item) => item.partId === part.partId ? { ...item, quantity: event.target.value } : item))}/>
        </label>
        <button type="button" className="icon-button" aria-label={t("Remove part")}
          onClick={() => onChange(parts.filter((item) => item.partId !== part.partId))}><X size={17}/></button>
        {priceDetails && option && <div className="log-part-price-details">{priceDetails(part, option)}</div>}
      </div>;
    })}
    {available.length > 0 && parts.length < 50 && <>
      <div className="log-part-picker">
        <div className="log-search">
          <Search size={16} aria-hidden="true"/>
          <input ref={searchInput} type="search" autoComplete="off" dir="auto" aria-label={t("Search parts")}
            placeholder={t("Search by part name or code")} value={query} onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
              event.preventDefault();
              if (matches.length === 1) addPart(matches[0]);
            }}/>
        </div>
        <Button type="button" aria-expanded={showResults} aria-controls={resultsId} onClick={() => {
          setQuery("");
          setBrowsing(!showResults);
        }}>{showResults ? <X size={14} aria-hidden="true"/> : <Plus size={14} aria-hidden="true"/>}
          {t(showResults ? "Hide parts" : "Add part")}
        </Button>
      </div>
      <div id={resultsId} hidden={!showResults}>
        {matches.length > 0 ? <ul className="log-part-results">{matches.map((option) => <li key={option.value}>
          <button type="button" className="log-part-choice" onClick={() => addPart(option)}>
            <bdi>{option.name}</bdi>
            <small><bdi>{option.code}</bdi>{option.price && <> · <bdi>{option.price}</bdi></>}</small>
          </button>
        </li>)}</ul> : <p role="status">{t("No matching parts")}</p>}
      </div>
    </>}
    {!inStock.length && <p>{t("No parts in stock.")}</p>}
  </fieldset>;
}
