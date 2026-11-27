import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, unlink } from "node:fs/promises";
import { join } from "node:path";
import { mutationUser } from "@/lib/auth";
import { requireRule, RuleError } from "@/lib/rules";
import { audit, lockedMutation, priorRequest, recordRequest, requireRequestKey } from "@/lib/transaction";
import { attachmentLimit, attachmentRoot, photoKeyPrefix, signature, workshopPhotoRoot } from "@/lib/storage";
import { workshopPhotosOn } from "@/lib/workshop-photos";
import { workshopPhotoLimit, workshopPhotoMaxBytes } from "@/lib/workshop-photo-limits";
import { canAccessAttachment, isWorkshopRecord } from "@/lib/permissions";

export async function POST(request: Request) {
  const requestId = request.headers.get("idempotency-key");
  const written: string[] = [];
  try {
    const actor = await mutationUser(request);
    const length = Number(request.headers.get("content-length") ?? "0");
    const maxFiles = requestId ? workshopPhotoLimit : 1;
    requireRule(length <= maxFiles * attachmentLimit + 65536, "invalidFile", 413);
    if (requestId) requireRequestKey(requestId);
    const content = await request.formData().catch(() => null);
    const files = content?.getAll("file") ?? [];
    const type = content?.get("type");
    const id = content?.get("target");
    requireRule(typeof id === "string" && id.length <= 100, "invalidFile");
    requireRule(files.length > 0, "invalidFile");
    requireRule(files.length <= maxFiles, "photoLimit");
    requireRule(files.every((file): file is File => file instanceof File && file.size > 0 && file.size <= attachmentLimit), "invalidFile");
    const uploads: { body: Buffer; mime: string; name: string }[] = [];
    for (const file of files) {
      const body = Buffer.from(await file.arrayBuffer());
      const mime = signature(body);
      requireRule(mime && mime === file.type, "invalidFile");
      const name = file.name.replace(/[\u0000-\u001F\u007F/\\]/g, "_").slice(0, 150);
      uploads.push({ body, mime, name });
    }

    const hash = requestId ? createHash("sha256").update(JSON.stringify({
      action: "attachment", id, type,
      files: uploads.map(({ body, mime, name }) => ({ mime, name, hash: createHash("sha256").update(body).digest("hex") })),
    })).digest("hex") : "";

    await lockedMutation(actor, async (tx, live) => {
      const vehicle = type === "vehicle" ? await tx.vehicle.findUnique({ where: { id }, select: { id: true } }) : null;
      const document = type === "document" ? await tx.document.findUnique({
        where: { id, kind: { not: "quote" } }, select: { id: true, kind: true, status: true },
      }) : null;
      requireRule(vehicle || document, "invalidDocument", 404);
      const photos = isWorkshopRecord(document?.kind) && uploads.every(({ mime }) => mime.startsWith("image/"));
      requireRule(photos || uploads.length === 1, "invalidFile");
      requireRule(canAccessAttachment(live.role, { vehicleId: vehicle?.id, documentKind: document?.kind }), "forbidden", 403);
      if (requestId && await priorRequest(tx, live, requestId, hash)) return;
      if (photos) {
        requireRule(document?.status !== "cancelled", "forbidden", 403);
        requireRule(await workshopPhotosOn(tx), "photosDisabled", 403);
        requireRule(uploads.every(({ body }) => body.length <= workshopPhotoMaxBytes), "photoTooLarge", 413);
        const count = await tx.attachment.count({ where: { documentId: id, mime: { startsWith: "image/" } } });
        requireRule(count + uploads.length <= workshopPhotoLimit, "photoLimit", 409);
      }

      const photoRoot = photos ? await workshopPhotoRoot(true) : null;
      const root = photoRoot ?? attachmentRoot();
      if (!photoRoot) await mkdir(root, { recursive: true });
      for (const { body, mime, name } of uploads) {
        const key = photoRoot ? photoKeyPrefix + randomUUID() : randomUUID();
        const path = join(root, key);
        try {
          const handle = await open(path, "wx", 0o600);
          written.push(path);
          try {
            await handle.writeFile(body);
          } finally {
            await handle.close();
          }
        } catch (error) {
          if (photoRoot) throw new RuleError("photoStorageUnavailable", 503);
          throw error;
        }
        const row = await tx.attachment.create({ data: {
          documentId: document?.id, vehicleId: vehicle?.id, name, mime, size: body.length, key, actorId: actor.id,
        } });
        await audit(tx, actor.id, "attachment", "attachment", row.id, null, { name, mime, id });
      }
      if (requestId) {
        const action = vehicle || isWorkshopRecord(document?.kind) ? "attachment:workshop" : "attachment:finance";
        await recordRequest(tx, live, requestId, hash, action, { ok: true });
      }
    });
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    await Promise.all(written.map((path) => unlink(path).catch(() => {})));
    if (error instanceof RuleError) return Response.json({ error: error.code }, { status: error.status });
    return Response.json({ error: "serverError" }, { status: 500 });
  }
}
