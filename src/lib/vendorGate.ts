import { NextResponse } from "next/server";

/**
 * Quy tắc trung tâm về việc một nhà bán có được bán hàng hay không.
 *
 * Ba điều kiện phải đúng CÙNG LÚC. Trước đây mỗi nơi tự kiểm một phần: `/api/shop` chỉ xem
 * `isApproved`, hàng đợi duyệt chỉ xem `verificationStatus`, còn các route thêm sản phẩm và
 * voucher thì không kiểm gì ngoài role. Hệ quả là một nhà bán vừa đăng ký, chưa ai duyệt, vẫn
 * đăng được sản phẩm và phát được mã giảm giá.
 */
export const VENDOR_CODES = {
  /** Nhà bán gọi API bán hàng khi chưa được duyệt. */
  notApproved: "vendor_not_approved",
  /** Sản phẩm không thể đặt mua vì trạng thái của nhà bán. */
  notSellable: "vendor_not_sellable",
  /** Quản trị viên đang duyệt một phiên bản hồ sơ đã cũ. */
  profileChanged: "vendor_profile_changed",
  /** Gửi hồ sơ từ một trạng thái không cho phép. */
  invalidTransition: "invalid_vendor_transition",
} as const;

export interface VendorApprovalFields {
  role?: string;
  verificationStatus?: string;
  isApproved?: boolean;
}

/**
 * Đúng khi tài khoản được phép phát sinh giao dịch bán mới.
 *
 * Kiểm cả `verificationStatus` lẫn `isApproved` là có chủ ý dù hai trường luôn được ghi cùng
 * nhau: chúng là hai trường riêng trên cùng document, nên một lần ghi thiếu ở đâu đó sẽ để lại
 * trạng thái nửa vời, và ở đây thà chặn oan hơn cho bán khi chưa ai duyệt.
 */
export function isVendorApproved(user: VendorApprovalFields): boolean {
  return (
    user.role === "vendor" &&
    user.verificationStatus === "approved" &&
    user.isApproved === true
  );
}

/** Bộ lọc MongoDB tương ứng, để dùng trong truy vấn thay vì lọc sau khi đã đọc. */
export const APPROVED_VENDOR_FILTER = {
  role: "vendor",
  verificationStatus: "approved",
  isApproved: true,
} as const;

/** 403 dùng chung cho mọi API bán hàng khi nhà bán chưa được duyệt. */
export function vendorNotApprovedResponse(): NextResponse {
  return NextResponse.json(
    {
      code: VENDOR_CODES.notApproved,
      message:
        "Cửa hàng của bạn chưa được quản trị viên duyệt nên chưa thể bán hàng. Bạn vẫn hoàn thiện được hồ sơ và xử lý các đơn đã phát sinh.",
    },
    { status: 403 },
  );
}
