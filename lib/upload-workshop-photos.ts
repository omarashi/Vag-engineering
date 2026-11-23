export async function uploadWorkshopPhotos(id: string, photos: File[], key: string): Promise<string | null> {
  const data = new FormData();
  data.set("target", id);
  data.set("type", "document");
  for (const photo of photos) data.append("file", photo);
  const response = await fetch("/api/attachments", {
    method: "POST", body: data, headers: { "Idempotency-Key": key },
  });
  if (response.ok) return null;
  const result = await response.json().catch(() => null);
  return result?.error ?? (response.status === 413 ? "photoTooLarge" : "serverError");
}
