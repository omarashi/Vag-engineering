import { db, type Tx } from "./db";

export function workshopPhotosEnabled(value: unknown) {
  return (value as { workshopPhotos?: boolean } | null | undefined)?.workshopPhotos === true;
}

export async function workshopPhotosOn(client: Pick<Tx, "setting"> = db) {
  const setting = await client.setting.findUnique({ where: { key: "business" }, select: { value: true } });
  return workshopPhotosEnabled(setting?.value);
}
