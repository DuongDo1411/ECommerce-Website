import { CATEGORY_CONFIG, CATEGORY_KEYS, type CategoryKey } from "./categories";

export interface CategoryInference {
  category: CategoryKey;
  needsReview: boolean;
}

/**
 * Tên shop thật trong DB thường không có dấu tiếng Việt (vd "Hoa Qua Shop VN"), trong khi
 * `shopNameKeywords` viết có dấu cho dễ đọc (vd "thời trang"). Chuẩn hóa cả hai vế về dạng
 * không dấu, chữ thường trước khi so khớp — nếu không, toàn bộ từ khóa có dấu sẽ không bao giờ
 * khớp được với tên shop không dấu. `normalize("NFD")` không tách "đ" thành "d" + dấu (đây là
 * ký tự Latin riêng, không phải d có dấu kết hợp), nên phải thay tay thêm một bước.
 */
function normalizeForMatch(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

/**
 * Suy ra ngành hàng chủ đạo của một vendor, theo đúng thứ tự ưu tiên trong kế hoạch:
 * 1. Category xuất hiện nhiều nhất trong các sản phẩm approved+active hiện có.
 * 2. Từ khóa trong `shopName`.
 * 3. Xoay vòng qua 10 category theo vị trí vendor trong danh sách, đánh dấu `needsReview`.
 */
export function inferVendorCategory(params: {
  shopName: string | undefined;
  existingCategories: string[];
  vendorIndex: number;
}): CategoryInference {
  const { shopName, existingCategories, vendorIndex } = params;

  const counts = new Map<CategoryKey, number>();
  for (const raw of existingCategories) {
    const key = CATEGORY_KEYS.find((k) => k === raw);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size > 0) {
    let best: CategoryKey = CATEGORY_KEYS[0];
    let bestCount = -1;
    for (const [key, count] of counts) {
      if (count > bestCount) {
        best = key;
        bestCount = count;
      }
    }
    return { category: best, needsReview: false };
  }

  const name = normalizeForMatch(shopName ?? "");
  if (name) {
    for (const key of CATEGORY_KEYS) {
      const keywords = CATEGORY_CONFIG[key].shopNameKeywords;
      if (keywords.some((kw) => name.includes(normalizeForMatch(kw)))) {
        return { category: key, needsReview: false };
      }
    }
  }

  const category = CATEGORY_KEYS[vendorIndex % CATEGORY_KEYS.length];
  return { category, needsReview: true };
}
