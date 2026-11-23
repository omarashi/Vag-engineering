import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { currentUser, mutationUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireRule, RuleError } from "@/lib/rules";
import { audit, lockedMutation } from "@/lib/transaction";
import { attachmentRoot } from "@/lib/storage";
import { workshopPhotosOn } from "@/lib/workshop-photos";
import { canAccessAttachment, isWorkshopRecord } from "@/lib/permissions";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const actor = await currentUser(request.headers);
  if (!actor) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  const file = await db.attachment.findUnique({
    where: { id, OR: [{ documentId: null }, { document: { kind: { not: "quote" } } }] },
    include: { document: { select: { kind: true } } },
  });
  if (!file || !/^[a-f0-9-]{36}$/.test(file.key) ||
    !canAccessAttachment(actor.role, { vehicleId: file.vehicleId, documentKind: file.document?.kind })) {
    return Response.json({ error: "notFound" }, { status: 404 });
  }
  const photo = isWorkshopRecord(file.document?.kind) && file.mime.startsWith("image/");
  if (photo && !await workshopPhotosOn()) return Response.json({ error: "notFound" }, { status: 404 });

  try {
    const data = await readFile(join(attachmentRoot(), file.key));
    const disposition = photo && new URL(request.url).searchParams.get("preview") === "1" ? "inline" : "attachment";
    return new Response(new Uint8Array(data), { headers: {
      "Content-Type": file.mime,
      "Content-Disposition": disposition + "; filename*=UTF-8''" + encodeURIComponent(file.name).replaceAll("'", "%27"),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    } });
  } catch {
    return Response.json({ error: "notFound" }, { status: 404 });
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params;
  try {
    const actor = await mutationUser(request);
    const key = await lockedMutation(actor, async (tx) => {
      const file = await tx.attachment.findUnique({
        where: { id }, include: { document: { select: { kind: true, status: true } } },
      });
      if (!file) return null;
      requireRule(isWorkshopRecord(file.document?.kind) && file.mime.startsWith("image/"), "notFound", 404);
      requireRule(file.document?.status !== "cancelled", "forbidden", 403);
      requireRule(await workshopPhotosOn(tx), "photosDisabled", 403);
      await tx.attachment.delete({ where: { id } });
      await audit(tx, actor.id, "removePhoto", "attachment", id, { name: file.name, documentId: file.documentId }, null);
      return file.key;
    });
    if (key && /^[a-f0-9-]{36}$/.test(key)) {
      await unlink(join(attachmentRoot(), key)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") console.warn("Could not remove the workshop photo file", { id, code: error.code });
      });
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof RuleError) return Response.json({ error: error.code }, { status: error.status });
    return Response.json({ error: "serverError" }, { status: 500 });
  }
}
