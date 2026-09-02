import { v2 as cloudinary } from "cloudinary";

import { hashManifestContent, type ManifestVendor, type SeedManifest } from "./manifest";

/**
 * Cloudinary config riêng cho script — không tái dùng `src/lib/cloudinary.ts` vì file đó không hỗ
 * trợ `public_id` tùy chỉnh (script cần public_id xác định `multicart/demo-seed/<runId>/<productId>`
 * để rollback xóa đúng asset), và kế hoạch yêu cầu không đụng `src/**`.
 */
let configured = false;
function ensureCloudinaryConfigured(): void {
  if (configured) return;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_CLOUD_APIKEY,
    api_secret: process.env.CLOUDINARY_CLOUD_APISECRET,
  });
  configured = true;
}

export const PEXELS_LICENSE_URL = "https://www.pexels.com/license/";
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export interface PexelsPhotoResult {
  sourcePageUrl: string;
  photographer: string;
  license: string;
  downloadUrl: string;
}

interface PexelsSearchResponse {
  photos: Array<{
    url: string;
    photographer: string;
    src: { large2x?: string; large?: string; original?: string };
  }>;
}

/** Tìm ĐÚNG MỘT ảnh cho một từ khóa qua Pexels API chính thức — không cào/đoán URL. */
export async function searchPexelsPhoto(
  keyword: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PexelsPhotoResult | null> {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(keyword)}&per_page=1&orientation=square`;
  const res = await fetchImpl(url, { headers: { Authorization: apiKey } });
  if (!res.ok) {
    throw new Error(`Pexels search thất bại (HTTP ${res.status}) cho từ khóa "${keyword}"`);
  }
  const data = (await res.json()) as PexelsSearchResponse;
  const photo = data.photos?.[0];
  if (!photo) return null;
  const downloadUrl = photo.src.large2x ?? photo.src.large ?? photo.src.original;
  if (!downloadUrl) return null;
  return {
    sourcePageUrl: photo.url,
    photographer: photo.photographer,
    license: PEXELS_LICENSE_URL,
    downloadUrl,
  };
}

export interface DownloadedImage {
  buffer: Buffer;
  contentType: string;
}

/** Tải ảnh về và kiểm định dạng/kích thước trước khi cho phép ghi DB — không tin mù URL. */
export async function downloadAndValidateImage(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DownloadedImage> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Tải ảnh thất bại (HTTP ${res.status}): ${url}`);
  const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error(`Định dạng ảnh không hợp lệ ("${contentType || "không rõ"}"): ${url}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`Ảnh vượt quá 10MB (${arrayBuffer.byteLength} bytes): ${url}`);
  }
  if (arrayBuffer.byteLength === 0) {
    throw new Error(`Ảnh tải về rỗng: ${url}`);
  }
  return { buffer: Buffer.from(arrayBuffer), contentType };
}

export interface ProductImageUrls {
  image1: string;
  image2: string;
  image3: string;
  image4: string;
}

/**
 * Sinh 4 URL biến thể (crop vuông, zoom nhẹ, nền pad sáng, tăng chất lượng) cho MỘT public_id đã
 * tồn tại trên Cloudinary — tách riêng khỏi `uploadProductImage` để có thể build lại URL cho ảnh
 * đã upload sẵn mà không cần upload lại (dùng khi sửa dữ liệu sai do lỗi build URL, không phải
 * lỗi upload).
 *
 * `transformation` (string) bị SDK hiểu là tên MỘT NAMED TRANSFORMATION đã lưu sẵn trong tài
 * khoản Cloudinary, nên tự thêm tiền tố "t_" — Cloudinary trả 400 "Unknown transformation" vì
 * không có named transformation nào tên "c_fill...". `raw_transformation` mới là cách truyền
 * chuỗi biến đổi viết tay nguyên văn, không qua xử lý/thêm tiền tố.
 */
export function buildImageVariantUrls(publicId: string): ProductImageUrls {
  ensureCloudinaryConfigured();
  const variant = (transformation: string) =>
    cloudinary.url(publicId, { raw_transformation: transformation, secure: true });

  return {
    image1: variant("c_fill,g_auto,w_900,h_900,q_auto"),
    image2: variant("c_fill,g_auto,w_900,h_900,z_1.15,q_auto"),
    image3: variant("c_pad,b_rgb:f5f5f5,w_900,h_900,q_auto"),
    image4: variant("c_fill,g_auto,w_900,h_900,e_improve,q_auto"),
  };
}

/**
 * Upload MỘT ảnh gốc rồi sinh 4 URL biến thể — đúng 4 field `image1..image4` mà `Product` model
 * yêu cầu, không cần 4 ảnh gốc riêng biệt.
 */
export async function uploadProductImage(
  image: DownloadedImage,
  publicId: string,
): Promise<ProductImageUrls> {
  ensureCloudinaryConfigured();
  const uploadResult = await new Promise<{ public_id: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, overwrite: true, resource_type: "image" },
      (error, result) => {
        if (error || !result) reject(error ?? new Error("Cloudinary upload trả về rỗng"));
        else resolve(result);
      },
    );
    stream.end(image.buffer);
  });

  return buildImageVariantUrls(uploadResult.public_id);
}

export async function deleteProductImage(publicId: string): Promise<void> {
  ensureCloudinaryConfigured();
  await cloudinary.uploader.destroy(publicId);
}

export interface DroppedVendor {
  vendorId: string;
  shopName: string;
  reason: string;
}

export interface ResolveImagesResult {
  manifest: SeedManifest;
  droppedVendors: DroppedVendor[];
}

/**
 * Điền `sourcePageUrl`/`photographer`/`license`/`downloadUrl` cho mọi sản phẩm trong manifest,
 * gọi Pexels đúng một lần cho mỗi từ khóa (nhiều vendor cùng ngành hàng dùng chung mẫu sản phẩm
 * nên chung từ khóa). Vendor có bất kỳ từ khóa nào không tìm được ảnh sẽ bị loại khỏi manifest
 * hoàn toàn — đúng yêu cầu "chọn ảnh thất bại thì dừng vendor đó trước khi ghi MongoDB".
 */
export async function resolveManifestImages(
  manifest: SeedManifest,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResolveImagesResult> {
  const cache = new Map<string, PexelsPhotoResult | null | Error>();
  const droppedVendors: DroppedVendor[] = [];
  const keepVendors: ManifestVendor[] = [];

  for (const vendor of manifest.vendors) {
    if (vendor.products.length === 0) {
      keepVendors.push(vendor);
      continue;
    }

    let failureReason: string | null = null;
    for (const product of vendor.products) {
      const keyword = product.image.keyword;
      if (!cache.has(keyword)) {
        try {
          cache.set(keyword, await searchPexelsPhoto(keyword, apiKey, fetchImpl));
        } catch (error) {
          cache.set(keyword, error instanceof Error ? error : new Error(String(error)));
        }
      }
      const cached = cache.get(keyword);
      if (!cached || cached instanceof Error) {
        failureReason =
          cached instanceof Error
            ? cached.message
            : `Không tìm thấy ảnh Pexels cho từ khóa "${keyword}"`;
        break;
      }
      product.image.sourcePageUrl = cached.sourcePageUrl;
      product.image.photographer = cached.photographer;
      product.image.license = cached.license;
      product.image.downloadUrl = cached.downloadUrl;
    }

    if (failureReason) {
      droppedVendors.push({ vendorId: vendor.vendorId, shopName: vendor.shopName, reason: failureReason });
    } else {
      keepVendors.push(vendor);
    }
  }

  manifest.vendors = keepVendors;
  manifest.manifestHash = hashManifestContent({
    seed: manifest.seed,
    target: manifest.target,
    vendors: manifest.vendors,
  });
  return { manifest, droppedVendors };
}
