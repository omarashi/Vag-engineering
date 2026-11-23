"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2, X } from "lucide-react";
import { message, translate, workshopPhotoHint, type Language } from "@/lib/locale";
import { requestKey } from "@/lib/request-key";
import { prepareWorkshopPhotos } from "@/lib/prepare-workshop-photo";
import { uploadWorkshopPhotos } from "@/lib/upload-workshop-photos";
import { Button, Panel } from "./ui";
import { WorkshopPhotoPicker } from "./workshop-photo-picker";

type Photo = { id: string; name: string };

export function WorkshopPhotos({ lang, id, files, allow, limit }: {
  lang: Language; id: string; files: Photo[]; allow: boolean; limit: number;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const uploadKey = useRef("");
  const prepared = useRef<File[] | null>(null);
  const [selection, setSelection] = useState<File[]>([]);
  const [removing, setRemoving] = useState<Photo>();
  const [working, setWorking] = useState<"Preparing photos…" | "Uploading photos…" | "Saving…" | null>(null);
  const busy = working !== null;
  const [error, setError] = useState("");
  const tr = (key: string) => translate(lang, key);
  const title = tr(removing ? "Remove photo?" : "Add photos");
  const remaining = Math.max(limit - files.length, 0);

  function updateSelection(photos: File[]) {
    setSelection(photos);
    prepared.current = null;
    uploadKey.current = "";
    setError("");
  }

  function open(photo?: Photo) {
    setRemoving(photo);
    updateSelection([]);
    dialog.current?.showModal();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working || (!removing && !selection.length)) return;
    setError("");
    if (!removing && selection.length > remaining) {
      setError("photoLimit");
      return;
    }
    setWorking(removing ? "Saving…" : "Preparing photos…");
    try {
      if (removing) {
        const response = await fetch("/api/attachments/" + removing.id, { method: "DELETE" });
        if (!response.ok) {
          const result = await response.json().catch(() => null);
          setError(result?.error ?? "serverError");
          return;
        }
      } else {
        if (!prepared.current) {
          try {
            prepared.current = await prepareWorkshopPhotos(selection);
          } catch {
            setError("invalidPhoto");
            return;
          }
        }
        setWorking("Uploading photos…");
        if (!uploadKey.current) uploadKey.current = requestKey();
        const failure = await uploadWorkshopPhotos(id, prepared.current, uploadKey.current);
        if (failure) {
          setError(failure);
          return;
        }
      }
      dialog.current?.close();
      router.refresh();
    } catch {
      setError("network");
    } finally {
      setWorking(null);
    }
  }

  return <Panel title={tr("Workshop photos")} icon={<Camera size={16}/>}>
    <div className="workshop-photos-body">
      {files.length > 0 && <ul className="workshop-photos-grid">
        {files.map((photo) => {
          const url = "/api/attachments/" + photo.id + "?preview=1";
          return <li key={photo.id}>
            <a href={url} target="_blank" rel="noopener noreferrer" title={photo.name}>
              {/* eslint-disable-next-line @next/next/no-img-element -- Photos use private, authenticated URLs. */}
              <img src={url} alt={photo.name} loading="lazy" decoding="async"/>
            </a>
            {allow && <button type="button" className="icon-button workshop-photo-remove"
              aria-label={tr("Remove photo") + " " + photo.name} onClick={() => open(photo)}><Trash2 size={16} aria-hidden="true"/></button>}
          </li>;
        })}
      </ul>}
      <div className="page-actions">
        {allow && remaining > 0 && <Button type="button" onClick={() => open()}><Camera size={16}/>{tr("Add photos")}</Button>}
        {remaining === 0 && <span className="workshop-photo-hint">{tr("Photo limit reached")}</span>}
      </div>
    </div>
    {allow && <dialog className="dialog workshop-photo-dialog" ref={dialog} aria-label={title}
      onCancel={(event) => { if (working) event.preventDefault(); }} onClose={() => updateSelection([])}>
      <form onSubmit={submit}>
        <header className="dialog-head"><h2>{title}</h2>
          <button type="button" className="icon-button" aria-label={tr("Close")} disabled={busy}
            onClick={() => dialog.current?.close()}><X size={18}/></button>
        </header>
        <div className="dialog-body">
          {removing ? <p><bdi>{removing.name}</bdi></p> : <>
            <WorkshopPhotoPicker lang={lang} limit={remaining} selection={selection} disabled={busy}
              onChange={updateSelection} onLimit={() => setError("photoLimit")}/>
            <p className="workshop-photo-hint">{workshopPhotoHint(lang)}</p>
          </>}
          {error && <p className="error" role="alert">{message(lang, error)}</p>}
        </div>
        <footer className="dialog-foot">
          <Button type="button" disabled={busy} onClick={() => dialog.current?.close()}>{tr("Cancel")}</Button>
          <Button variant="primary" disabled={busy || (!removing && !selection.length)}>{tr(working ?? (removing ? "Remove photo" : "Upload"))}</Button>
        </footer>
      </form>
    </dialog>}
  </Panel>;
}
