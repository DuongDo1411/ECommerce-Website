import {
  deleteCloudinaryAssets,
  uploadCloudinaryAsset,
} from "@/lib/cloudinary";

export const MAX_EVIDENCE_FILES = 5;
export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

export type EvidenceResult =
  | { urls: string[]; publicIds: string[] }
  | { error: { code: string; message: string } };

export async function discardEvidence(
  evidence?: { publicIds?: string[] } | null,
): Promise<void> {
  if (evidence?.publicIds?.length) {
    await deleteCloudinaryAssets(evidence.publicIds);
  }
}

async function isRealImage(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const at = (signature: number[], offset = 0) =>
    signature.every((byte, index) => head[offset + index] === byte);

  if (at([0xff, 0xd8, 0xff])) return true;
  if (at([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return true;
  if (at([0x47, 0x49, 0x46, 0x38])) return true;
  return (
    at([0x52, 0x49, 0x46, 0x46]) &&
    at([0x57, 0x45, 0x42, 0x50], 8)
  );
}

export async function collectEvidence(
  formData: FormData,
  field = "files",
): Promise<EvidenceResult> {
  const files = formData
    .getAll(field)
    .filter((value): value is File => value instanceof File && value.size > 0);

  if (files.length > MAX_EVIDENCE_FILES) {
    return {
      error: {
        code: "too_many_files",
        message: `Tối đa ${MAX_EVIDENCE_FILES} ảnh mỗi lần gửi`,
      },
    };
  }

  for (const file of files) {
    if (file.size > MAX_EVIDENCE_BYTES) {
      return {
        error: { code: "file_too_large", message: "Mỗi ảnh tối đa 5MB" },
      };
    }
    if (!(await isRealImage(file))) {
      return {
        error: {
          code: "not_an_image",
          message: "Chỉ chấp nhận ảnh JPEG/PNG/GIF/WebP",
        },
      };
    }
  }

  const urls: string[] = [];
  const publicIds: string[] = [];
  for (const file of files) {
    const asset = await uploadCloudinaryAsset(file, {
      folder: "returns/evidence",
    }).catch(() => null);
    if (!asset) {
      await deleteCloudinaryAssets(publicIds);
      return {
        error: { code: "upload_failed", message: "Upload ảnh thất bại" },
      };
    }
    urls.push(asset.url);
    publicIds.push(asset.publicId);
  }

  return { urls, publicIds };
}
