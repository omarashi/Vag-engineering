"use client";

import { useRef, type ChangeEvent } from "react";
import { Camera, X } from "lucide-react";
import { translate, type Language } from "@/lib/locale";
import { Button } from "./ui";

const photoFormats = "image/*,.heic,.heif";

export function WorkshopPhotoPicker({ lang, limit, selection, disabled, onChange, onLimit }: {
  lang: Language;
  limit: number;
  selection: File[];
  disabled: boolean;
  onChange: (photos: File[]) => void;
  onLimit: () => void;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const t = (key: string) => translate(lang, key);
  const slots = limit - selection.length;

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (disabled || !chosen.length) return;
    if (chosen.length > slots) onLimit();
    else onChange([...selection, ...chosen]);
  }

  return <>
    <input ref={camera} hidden type="file" aria-label={t("Take photo")} accept={photoFormats} capture="environment" disabled={disabled} onChange={choose}/>
    <input ref={gallery} hidden type="file" aria-label={t("Choose photos")} accept={photoFormats} multiple={slots > 1} disabled={disabled} onChange={choose}/>
    <div className="page-actions">
      <Button type="button" disabled={disabled || slots <= 0} onClick={() => camera.current?.click()}>
        <Camera size={16}/>{t("Take photo")}
      </Button>
      <Button type="button" disabled={disabled || slots <= 0} onClick={() => gallery.current?.click()}>{t("Choose photos")}</Button>
    </div>
    {selection.length > 0 && <ul className="workshop-photo-selection">{selection.map((photo, index) => <li key={index}>
      <bdi>{photo.name}</bdi>
      <button type="button" className="icon-button" aria-label={t("Remove photo") + " " + photo.name} disabled={disabled}
        onClick={() => onChange(selection.filter((_, i) => i !== index))}><X size={15}/></button>
    </li>)}</ul>}
  </>;
}
