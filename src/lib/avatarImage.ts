import type { AccountAvatarMimeType } from "./accountTypes";

export const MAX_AVATAR_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_AVATAR_UPLOAD_BYTES = 128 * 1024;
const avatarSizes = [320, 256, 192, 128] as const;
const avatarQualities = [0.86, 0.72, 0.56] as const;

export class AvatarImageError extends Error {
  constructor(public readonly reason: "type" | "size" | "decode" | "encode") {
    super(reason);
  }
}

export interface PreparedAvatar {
  mimeType: AccountAvatarMimeType;
  dataBase64: string;
  preview: string;
}

function encodeCanvas(canvas: HTMLCanvasElement, mimeType: "image/webp" | "image/jpeg", quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32 * 1024) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32 * 1024));
  }
  return btoa(binary);
}

export async function prepareAvatarUpload(file: File): Promise<PreparedAvatar> {
  if (file.type && (!file.type.startsWith("image/") || file.type === "image/svg+xml")) throw new AvatarImageError("type");
  if (file.size > MAX_AVATAR_SOURCE_BYTES) throw new AvatarImageError("size");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new AvatarImageError("decode");
  }

  try {
    if (!bitmap.width || !bitmap.height) throw new AvatarImageError("decode");
    const sourceSize = Math.min(bitmap.width, bitmap.height);
    const sourceX = (bitmap.width - sourceSize) / 2;
    const sourceY = (bitmap.height - sourceSize) / 2;

    for (const size of avatarSizes) {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) throw new AvatarImageError("encode");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";

      for (const targetType of ["image/webp", "image/jpeg"] as const) {
        for (const quality of avatarQualities) {
          context.clearRect(0, 0, size, size);
          if (targetType === "image/jpeg") {
            context.fillStyle = "#102128";
            context.fillRect(0, 0, size, size);
          }
          context.drawImage(bitmap, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
          const output = await encodeCanvas(canvas, targetType, quality);
          if (!output || output.size > MAX_AVATAR_UPLOAD_BYTES
            || !["image/png", "image/jpeg", "image/webp"].includes(output.type)) continue;
          const mimeType = output.type as AccountAvatarMimeType;
          const dataBase64 = toBase64(new Uint8Array(await output.arrayBuffer()));
          return { mimeType, dataBase64, preview: `data:${mimeType};base64,${dataBase64}` };
        }
      }
    }
    throw new AvatarImageError("encode");
  } finally {
    bitmap.close();
  }
}
