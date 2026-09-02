import { describe, expect, it } from "vitest";

import { loginForRole } from "@/lib/roleRoutes";
import { isVendorApproved } from "@/lib/vendorGate";
import {
  isVendorProfileComplete,
  isVendorProfileIncomplete,
} from "@/lib/vendorProfile";

const completeProfile = {
  phone: "0901234567",
  shopName: "Shop",
  shopAddress: "1 Đường A, Phường B, Quận C, Tỉnh D",
  taxNumber: "0101234567",
  shopAddressDetail: {
    address: "1 Đường A",
    wardCode: "W1",
    wardName: "Phường B",
    districtId: 1,
    districtName: "Quận C",
    provinceId: 2,
    provinceName: "Tỉnh D",
  },
};

// Ba điều kiện phải đúng cùng lúc. Mỗi test dưới đây tắt đúng một điều kiện, vì đó là cách một
// trạng thái nửa vời phát sinh thật: hai trường được ghi ở hai chỗ khác nhau.
describe("nhà bán được phép bán", () => {
  it("đúng khi role vendor, đã duyệt và isApproved", () => {
    expect(
      isVendorApproved({
        role: "vendor",
        verificationStatus: "approved",
        isApproved: true,
      }),
    ).toBe(true);
  });

  it("sai với draft, pending, rejected", () => {
    for (const verificationStatus of ["draft", "pending", "rejected"]) {
      expect(
        isVendorApproved({ role: "vendor", verificationStatus, isApproved: true }),
        verificationStatus,
      ).toBe(false);
    }
  });

  it("sai khi isApproved chưa bật dù trạng thái đã approved", () => {
    expect(
      isVendorApproved({
        role: "vendor",
        verificationStatus: "approved",
        isApproved: false,
      }),
    ).toBe(false);
  });

  it("sai với tài khoản người mua và quản trị viên", () => {
    for (const role of ["user", "admin"]) {
      expect(
        isVendorApproved({
          role,
          verificationStatus: "approved",
          isApproved: true,
        }),
        role,
      ).toBe(false);
    }
  });
});

describe("hồ sơ cửa hàng đầy đủ", () => {
  it("đúng với hồ sơ đủ trường và số điện thoại hợp lệ", () => {
    expect(isVendorProfileComplete(completeProfile)).toBe(true);
  });

  it("từ chối số điện thoại sai định dạng", () => {
    // Số này là `from_phone` duy nhất gửi tới GHN; kiểm rỗng thôi thì một chuỗi rác vẫn qua.
    for (const phone of ["", "090123456", "09012345678", "1901234567", "abcdefghij"]) {
      expect(
        isVendorProfileComplete({ ...completeProfile, phone }),
        phone || "(rỗng)",
      ).toBe(false);
    }
  });

  it("từ chối mã số thuế sai định dạng", () => {
    // Điều 5 Thông tư 86/2024/TT-BTC: 10 chữ số, hoặc 13 chữ số có gạch ngang phân tách 10 số
    // đầu và 3 số cuối. Trước khi có kiểm này, một chuỗi bất kỳ (kể cả lẫn chữ cái) vẫn qua.
    for (const taxNumber of ["3692929292929abcez", "010", "0101234567-1", "0101234567-"]) {
      expect(
        isVendorProfileComplete({ ...completeProfile, taxNumber }),
        taxNumber,
      ).toBe(false);
    }
  });

  it("chấp nhận mã số thuế 13 số có gạch ngang cho đơn vị phụ thuộc", () => {
    expect(
      isVendorProfileComplete({
        ...completeProfile,
        taxNumber: "0101234567-001",
      }),
    ).toBe(true);
  });

  it("từ chối chuỗi chỉ có khoảng trắng", () => {
    expect(
      isVendorProfileComplete({ ...completeProfile, shopName: "   " }),
    ).toBe(false);
    expect(
      isVendorProfileComplete({ ...completeProfile, taxNumber: "  " }),
    ).toBe(false);
  });

  it("từ chối khi thiếu mã GHN", () => {
    expect(
      isVendorProfileComplete({
        ...completeProfile,
        shopAddressDetail: { ...completeProfile.shopAddressDetail, wardCode: "" },
      }),
    ).toBe(false);
    expect(
      isVendorProfileComplete({
        ...completeProfile,
        shopAddressDetail: { ...completeProfile.shopAddressDetail, districtId: 0 },
      }),
    ).toBe(false);
    expect(
      isVendorProfileComplete({ ...completeProfile, shopAddressDetail: null }),
    ).toBe(false);
  });

  // Hai câu hỏi khác nhau: quản trị viên hỏi "dữ liệu đã đủ chưa", nhà bán hỏi "tôi còn việc gì".
  it("draft luôn là còn việc phải làm, dù dữ liệu đã đủ", () => {
    const draft = { ...completeProfile, verificationStatus: "draft" };
    expect(isVendorProfileComplete(draft)).toBe(true);
    expect(isVendorProfileIncomplete(draft)).toBe(true);
  });

  it("hồ sơ đủ và không phải draft thì không còn việc phải làm", () => {
    expect(
      isVendorProfileIncomplete({
        ...completeProfile,
        verificationStatus: "pending",
      }),
    ).toBe(false);
  });
});

// Mỗi vai trò đăng nhập ở một cổng riêng, và cổng người mua từ chối tài khoản role khác. Đẩy
// tất cả về `/login` nghĩa là nhà bán vừa đặt lại mật khẩu xong lại bị đưa tới đúng chỗ không
// cho họ vào.
describe("cổng đăng nhập theo vai trò", () => {
  it("trả đúng cổng cho từng vai trò", () => {
    expect(loginForRole("user")).toBe("/login");
    expect(loginForRole("vendor")).toBe("/vendor/login");
    expect(loginForRole("admin")).toBe("/admin/login");
  });

  it("mặc định về cổng người mua với giá trị không hợp lệ", () => {
    for (const role of [undefined, null, "", "khong-ton-tai", 7, {}]) {
      expect(loginForRole(role), JSON.stringify(role)).toBe("/login");
    }
  });
});
