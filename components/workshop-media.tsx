import type { Attachment } from "@prisma/client";
import type { Language } from "@/lib/locale";
import { workshopPhotosOn } from "@/lib/workshop-photos";
import { workshopPhotoLimit } from "@/lib/workshop-photo-limits";
import { Attachments } from "./attachments";
import { WorkshopPhotos } from "./workshop-photos";

export async function WorkshopMedia({ lang, id, files, allowPhotos, allowAttachments, showAttachments, photosEnabled }: {
  lang: Language; id: string; files: Pick<Attachment, "id" | "name" | "mime">[];
  allowPhotos: boolean; allowAttachments: boolean; showAttachments: boolean; photosEnabled?: boolean;
}) {
  const photos = files.filter((file) => file.mime.startsWith("image/"));
  const documents = files.filter((file) => !file.mime.startsWith("image/"));
  const showPhotos = (allowPhotos || photos.length > 0) && (photosEnabled ?? await workshopPhotosOn());

  return <>
    {showPhotos && <WorkshopPhotos lang={lang} id={id} files={photos.map(({ id, name }) => ({ id, name }))}
      allow={allowPhotos} limit={workshopPhotoLimit}/>}
    {(showAttachments || documents.length > 0) && <Attachments lang={lang} id={id} type="document"
      files={documents.map(({ id, name }) => ({ id, name }))} allow={allowAttachments} pdfOnly/>}
  </>;
}
