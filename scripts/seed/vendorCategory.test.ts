import { describe, expect, it } from "vitest";

import { inferVendorCategory } from "./vendorCategory";

describe("inferVendorCategory — tầng 1: category đa số trong sản phẩm hiện có", () => {
  it("chọn category xuất hiện nhiều nhất, không cần xem lại", () => {
    const result = inferVendorCategory({
      shopName: "Bất kỳ tên gì",
      existingCategories: ["Electronics & Gadgets", "Electronics & Gadgets", "Home & Living"],
      vendorIndex: 0,
    });
    expect(result).toEqual({ category: "Electronics & Gadgets", needsReview: false });
  });
});

describe("inferVendorCategory — tầng 2: từ khóa trong shopName", () => {
  it("khớp từ khóa dù tên shop không có dấu tiếng Việt", () => {
    // Regression: tên shop thật trong DB không có dấu (vd "Hoa Qua Shop VN"), trong khi
    // shopNameKeywords viết có dấu — nếu không chuẩn hóa thì sẽ không bao giờ khớp.
    const result = inferVendorCategory({
      shopName: "Hoa Qua Shop VN",
      existingCategories: [],
      vendorIndex: 0,
    });
    expect(result).toEqual({ category: "Food & Grocery", needsReview: false });
  });

  it("khớp thương hiệu điện tử viết liền không dấu", () => {
    const result = inferVendorCategory({
      shopName: "Gigabyte VN Shop",
      existingCategories: [],
      vendorIndex: 0,
    });
    expect(result).toEqual({ category: "Electronics & Gadgets", needsReview: false });
  });

  it("chữ 'shop' một mình không được coi là từ khóa của Fashion & Lifestyle", () => {
    // Regression: "shop" từng nằm trong shopNameKeywords của Fashion & Lifestyle — quá chung,
    // khớp nhầm mọi shop có chữ "Shop" trong tên (vd "Gigabyte VN Shop").
    const result = inferVendorCategory({
      shopName: "Gigabyte VN Shop",
      existingCategories: [],
      vendorIndex: 0,
    });
    expect(result.category).not.toBe("Fashion & Lifestyle");
  });

  it("khớp từ khóa thương hiệu thời trang/giày viết liền", () => {
    const result = inferVendorCategory({
      shopName: "AdidasBacNinh",
      existingCategories: [],
      vendorIndex: 0,
    });
    expect(result).toEqual({ category: "Fashion & Lifestyle", needsReview: false });
  });
});

describe("inferVendorCategory — tầng 3: xoay vòng, đánh dấu cần xem lại", () => {
  it("không khớp gì thì xoay vòng theo vendorIndex và needsReview=true", () => {
    const first = inferVendorCategory({
      shopName: "CuaHangThanhHoa",
      existingCategories: [],
      vendorIndex: 0,
    });
    const second = inferVendorCategory({
      shopName: "CuaHangThanhHoa",
      existingCategories: [],
      vendorIndex: 1,
    });
    expect(first.needsReview).toBe(true);
    expect(second.needsReview).toBe(true);
    expect(first.category).not.toBe(second.category);
  });
});
