import { workshopPhotoMaxBytes } from "./workshop-photo-limits";

async function decodeHeic(file: File) {
  const header = new TextDecoder().decode(await file.slice(4, 12).arrayBuffer());
  if (!/^ftyp(heic|heix|hevc|hevx|mif1|msf1)$/.test(header)) throw new Error("Unsupported photo format");
  const { heicTo } = await import("heic-to/csp");
  return heicTo({ blob: file, type: "bitmap" });
}

async function prepareWorkshopPhoto(file: File) {
  const image = new Image();
  const url = URL.createObjectURL(file);
  const canvas = document.createElement("canvas");
  let bitmap: ImageBitmap | undefined;

  try {
    const native = await new Promise<boolean>((resolve) => {
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = url;
    });
    if (!native) bitmap = await decodeHeic(file);

    const width = bitmap?.width ?? image.naturalWidth;
    const height = bitmap?.height ?? image.naturalHeight;
    const context = canvas.getContext("2d", { alpha: false });
    if (!width || !height || !context) throw new Error("Photo could not be decoded");

    const longestSide = Math.max(width, height);
    const sizes = new Set([2400, 1800, 1200, 800].map((size) => Math.min(size, longestSide)));
    for (const size of sizes) {
      const scale = size / longestSide;
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap ?? image, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.88, 0.75, 0.60]) {
        const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        if (jpeg?.type === "image/jpeg" && jpeg.size > 0 && jpeg.size <= workshopPhotoMaxBytes) {
          const name = file.name.replace(/\.[^.]+$/, "").slice(0, 146) || "photo";
          return new File([jpeg], name + ".jpg", { type: "image/jpeg" });
        }
      }
    }
    throw new Error("Photo could not be compressed");
  } finally {
    bitmap?.close();
    image.removeAttribute("src");
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 1;
  }
}

export async function prepareWorkshopPhotos(files: File[]) {
  const photos: File[] = [];
  for (const file of files) photos.push(await prepareWorkshopPhoto(file));
  return photos;
}
