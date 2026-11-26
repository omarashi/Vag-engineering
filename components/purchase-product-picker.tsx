import { useEffect, useId, useRef, useState } from "react";
import { translate, type Language } from "@/lib/locale";

type Product = { value: string; name: string; search?: string };
const normalize = (text: string) => text.toLowerCase().replace(/[\s_-]+/g, "");

export function PurchaseProductPicker({ lang, title, options, value, onSelect }: {
  lang: Language; title: string; options: readonly Product[]; value?: string; onSelect: (value: string) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const titleText = translate(lang, title);
  const selection = options.find((item) => item.value === value);
  const terms = (query ?? "").trim().split(/\s+/).map(normalize).filter(Boolean);
  const matches = open ? options.filter((item) => {
    const searchable = normalize(item.name + " " + (item.search ?? ""));
    return terms.every((term) => searchable.includes(term));
  }).slice(0, 30) : [];

  useEffect(() => {
    results.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function close() {
    setOpen(false);
    setActive(-1);
    setQuery(null);
    input.current?.setCustomValidity("");
  }

  function choose(item: Product) {
    onSelect(item.value);
    close();
  }

  return <div className="field wide purchase-product-picker">
    <label htmlFor={id}>{titleText}</label>
    <input id={id} ref={input} required role="combobox" aria-autocomplete="list" aria-expanded={open}
      aria-controls={open ? id + "-results" : undefined}
      aria-activedescendant={matches[active] ? id + "-option-" + active : undefined}
      dir="auto" autoComplete="off" placeholder={translate(lang, "Search by part name or code")}
      value={query ?? selection?.name ?? ""}
      onFocus={(event) => { setOpen(true); event.currentTarget.select(); }}
      onClick={() => setOpen(true)}
      onBlur={close}
      onChange={(event) => {
        setQuery(event.target.value);
        setOpen(true);
        setActive(-1);
        event.target.setCustomValidity(translate(lang, "Choose a product from the results."));
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          setOpen(true);
          if (!open) setActive(0);
          else if (matches.length) setActive(event.key === "ArrowDown"
            ? Math.min(active + 1, matches.length - 1)
            : active < 0 ? matches.length - 1 : Math.max(0, active - 1));
        } else if (event.key === "Enter") {
          event.preventDefault();
          if (!open) setOpen(true);
          else {
            const item = matches[active] ?? (matches.length === 1 ? matches[0] : undefined);
            if (item) choose(item);
          }
        }
      }}/>
    {open && <>
      <ul id={id + "-results"} ref={results} className="log-part-results" role="listbox" aria-label={titleText}>
        {matches.map((item, index) => <li key={item.value} role="option" aria-selected={index === active}
          id={id + "-option-" + index} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)}>
          <bdi>{item.name}</bdi>
        </li>)}
      </ul>
      {matches.length === 0 && <p role="status">{translate(lang, "No matching parts")}</p>}
    </>}
  </div>;
}
