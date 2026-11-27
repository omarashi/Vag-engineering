import { lstat, mkdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { RuleError } from "./rules";

export const attachmentLimit=10*1024*1024;
export function attachmentRoot(){return resolve(/*turbopackIgnore: true*/ process.env.ATTACHMENT_DIR ?? "./data/attachments");}
export const photoKeyPrefix = "photo-";
export const attachmentKeyPattern = /^(?:photo-)?[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

export async function workshopPhotoRoot(create = false) {
  const configured = process.env.PHOTO_STORAGE_PATH;
  const volumeId = process.env.PHOTO_STORAGE_VOLUME_ID;
  if (!configured && !volumeId) return null;

  try {
    if (!configured) throw new Error("Missing photo storage path");
    const root = resolve(/*turbopackIgnore: true*/ configured);
    if (volumeId) {
      const marker = join(root, ".vag-photo-volume");
      const [directory, markerInfo, system, attachments] = await Promise.all([
        lstat(root), lstat(marker), stat("/"), stat(attachmentRoot()),
      ]);
      if (!directory.isDirectory() || !markerInfo.isFile() || markerInfo.dev !== directory.dev ||
        directory.dev === system.dev || directory.dev === attachments.dev ||
        (await readFile(marker, "utf8")).trim() !== volumeId) {
        throw new Error("Unexpected photo volume");
      }
    } else if (create) {
      await mkdir(root, { recursive: true });
    }
    return root;
  } catch {
    throw new RuleError("photoStorageUnavailable", 503);
  }
}

export async function attachmentPath(key: string) {
  if (!key.startsWith(photoKeyPrefix)) return join(attachmentRoot(), key);
  const root = await workshopPhotoRoot();
  if (!root) throw new RuleError("photoStorageUnavailable", 503);
  return join(/*turbopackIgnore: true*/ root, key);
}

export function signature(bytes:Buffer){
  if(bytes.subarray(0,5).toString()==="%PDF-")return "application/pdf";
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return "image/jpeg";
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return "image/png";
  if(bytes.subarray(0,4).toString()==="RIFF"&&bytes.subarray(8,12).toString()==="WEBP")return "image/webp";
  return null;
}

