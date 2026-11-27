import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { attachmentPath, photoKeyPrefix, workshopPhotoRoot } from "../lib/storage";

test("photo keys use the dedicated store and a missing Oracle volume cannot fall back to attachments", async () => {
  const temp = await mkdtemp(join(tmpdir(), "vag-storage-"));
  const variables = ["ATTACHMENT_DIR", "PHOTO_STORAGE_PATH", "PHOTO_STORAGE_VOLUME_ID"];
  const previous = variables.map((variable) => process.env[variable]);
  const attachments = join(temp, "attachments");
  const photos = join(temp, "photos");
  const key = randomUUID();
  const photoKey = photoKeyPrefix + key;
  const unavailable = { code: "photoStorageUnavailable", status: 503 };
  try {
    process.env.ATTACHMENT_DIR = attachments;
    delete process.env.PHOTO_STORAGE_PATH;
    delete process.env.PHOTO_STORAGE_VOLUME_ID;
    assert.equal(await workshopPhotoRoot(true), null);
    assert.equal(await attachmentPath(key), join(attachments, key));
    await assert.rejects(attachmentPath(photoKey), unavailable);

    process.env.PHOTO_STORAGE_PATH = photos;
    process.env.PHOTO_STORAGE_VOLUME_ID = randomUUID();
    await assert.rejects(workshopPhotoRoot(true), unavailable);
    await assert.rejects(stat(photos), { code: "ENOENT" });

    await mkdir(attachments);
    await mkdir(photos);
    await writeFile(join(photos, ".vag-photo-volume"), process.env.PHOTO_STORAGE_VOLUME_ID);
    await assert.rejects(attachmentPath(photoKey), unavailable);
    assert.equal(await attachmentPath(key), join(attachments, key));

    delete process.env.PHOTO_STORAGE_VOLUME_ID;
    assert.equal(await workshopPhotoRoot(true), photos);
    assert.equal(await attachmentPath(photoKey), join(photos, photoKey));
  } finally {
    for (const [index, variable] of variables.entries()) {
      if (previous[index] === undefined) delete process.env[variable];
      else process.env[variable] = previous[index];
    }
    await rm(temp, { recursive: true, force: true });
  }
});
