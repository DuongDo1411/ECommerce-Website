import { VENDOR_CODES } from "@/lib/vendorGate";
import {
  isVendorProfileComplete,
  VN_PHONE_PATTERN,
  VN_TAX_NUMBER_PATTERN,
} from "@/lib/vendorProfile";
import User from "@/model/user.model";

/**
 * Nộp hoặc cập nhật hồ sơ cửa hàng — nơi DUY NHẤT thực hiện chuyển trạng thái này.
 *
 * `editDetails` và `verifyagain` trước đây là hai bản cài đặt riêng của cùng một việc, và chúng
 * đã lệch nhau: `verifyagain` nhận nguyên chuỗi `shopAddress` do client gửi, không kiểm địa chỉ
 * GHN và không có số điện thoại. Gộp về một chỗ để quy tắc chuyển trạng thái không thể khác nhau
 * tuỳ theo người dùng bấm nút nào.
 *
 * Quy tắc chuyển trạng thái:
 *
 * - `draft`, `rejected`, hoặc nhà bán cũ còn thiếu hồ sơ: gửi được, thành `pending`.
 * - `approved` sửa thông tin: quay lại `pending` và `isApproved=false`. Địa chỉ lấy hàng cùng mã
 *   số thuế là những thứ quản trị viên đã đối chiếu một lần; đổi rồi thì lần đối chiếu đó hết
 *   giá trị, nên cửa hàng tạm ngưng nhận giao dịch mới cho tới khi được duyệt lại.
 * - `pending` mà hồ sơ ĐÃ đầy đủ: từ chối. Họ đang chờ, gửi lại chỉ đẩy `requestedAt` lên và
 *   làm hồ sơ nhảy xuống cuối hàng đợi.
 *
 * Điều kiện "đã đầy đủ" ở nhánh cuối là cố ý. Nhà bán cũ mang `verificationStatus: "pending"`
 * do giá trị mặc định của schema chứ chưa từng gửi gì; chặn cứng theo trạng thái sẽ khoá luôn
 * những tài khoản đó ngoài form khai hồ sơ.
 */

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export interface SubmitVendorProfileResult {
  status: number;
  code?: string;
  message: string;
  vendor?: {
    shopName: string;
    shopAddress: string;
    taxNumber: string;
    phone: string;
    verificationStatus: string;
    isApproved: boolean;
    requestedAt: string | null;
  };
}

export async function submitVendorProfile(
  vendorId: unknown,
  body: unknown,
): Promise<SubmitVendorProfileResult> {
  const b = (body ?? {}) as Record<string, unknown>;

  // Số điện thoại này là `from_phone` duy nhất gửi tới GHN khi tạo vận đơn. Bỏ trống thì mã
  // nguồn thay bằng "0000000000", tức nhân viên lấy hàng không gọi được cho ai.
  const phone = clean(b.phone, 20);
  if (!VN_PHONE_PATTERN.test(phone)) {
    return {
      status: 400,
      message: "Số điện thoại không hợp lệ — 10 chữ số, bắt đầu bằng 0.",
    };
  }

  const shopName = clean(b.shopName, 120);
  const taxNumber = clean(b.taxNumber, 50);
  if (!shopName) {
    return { status: 400, message: "Tên cửa hàng là bắt buộc." };
  }

  // Điều 5 Thông tư 86/2024/TT-BTC (hiệu lực 06/02/2025): 10 chữ số cho đơn vị độc lập, hoặc
  // 13 chữ số có gạch ngang phân tách 10 số đầu và 3 số cuối cho đơn vị phụ thuộc. Trước quy
  // tắc này trường chỉ kiểm không rỗng, nên một chuỗi bất kỳ (kể cả lẫn chữ cái) đều lọt qua.
  if (!VN_TAX_NUMBER_PATTERN.test(taxNumber)) {
    return {
      status: 400,
      message:
        "Mã số thuế không hợp lệ. Nhập 10 chữ số (VD 0101234567), hoặc 13 chữ số có gạch ngang cho đơn vị phụ thuộc (VD 0101234567-001).",
    };
  }

  const detail = (b.shopAddressDetail ?? {}) as Record<string, unknown>;
  const address = clean(detail.address, 255);
  const wardCode = clean(detail.wardCode, 30);
  const wardName = clean(detail.wardName, 120);
  const districtName = clean(detail.districtName, 120);
  const provinceName = clean(detail.provinceName, 120);
  const districtId = Number(detail.districtId);
  const provinceId = Number(detail.provinceId);

  if (
    !address ||
    !wardCode ||
    !wardName ||
    !districtName ||
    !provinceName ||
    !Number.isInteger(districtId) ||
    districtId <= 0 ||
    !Number.isInteger(provinceId) ||
    provinceId <= 0
  ) {
    return {
      status: 400,
      message:
        "Vui lòng chọn đầy đủ Tỉnh/Thành phố, Quận/Huyện, Phường/Xã và nhập địa chỉ chi tiết.",
    };
  }

  const current = await User.findOne({ _id: vendorId, role: "vendor" }).select(
    "phone shopName shopAddress taxNumber shopAddressDetail verificationStatus",
  );
  if (!current) {
    return { status: 404, message: "Không tìm thấy nhà bán." };
  }

  if (
    current.verificationStatus === "pending" &&
    isVendorProfileComplete(current)
  ) {
    return {
      status: 409,
      code: VENDOR_CODES.invalidTransition,
      message:
        "Hồ sơ của bạn đang chờ quản trị viên duyệt. Vui lòng đợi kết quả trước khi gửi lại.",
    };
  }

  // Dựng `shopAddress` từ dữ liệu đã kiểm, không nhận chuỗi của client: nếu nhận, chuỗi hiển
  // thị và mã phường/quận thật đi tới GHN có thể nói hai điều khác nhau.
  const shopAddress = `${address}, ${wardName}, ${districtName}, ${provinceName}`;

  const updated = await User.findOneAndUpdate(
    { _id: vendorId, role: "vendor" },
    {
      $set: {
        phone,
        shopName,
        taxNumber,
        shopAddress,
        shopAddressDetail: {
          address,
          wardCode,
          wardName,
          districtId,
          districtName,
          provinceId,
          provinceName,
        },
        verificationStatus: "pending",
        isApproved: false,
        requestedAt: new Date(),
      },
      $unset: { approvedAt: "", rejectedReason: "" },
    },
    { returnDocument: "after" },
  ).select(
    "shopName shopAddress taxNumber phone verificationStatus isApproved requestedAt",
  );

  if (!updated) {
    return { status: 404, message: "Không tìm thấy nhà bán." };
  }

  return {
    status: 200,
    message: "Đã gửi hồ sơ cửa hàng. Vui lòng chờ quản trị viên duyệt.",
    vendor: {
      shopName: updated.shopName ?? "",
      shopAddress: updated.shopAddress ?? "",
      taxNumber: updated.taxNumber ?? "",
      phone: updated.phone ?? "",
      verificationStatus: updated.verificationStatus ?? "pending",
      isApproved: updated.isApproved ?? false,
      requestedAt: updated.requestedAt?.toISOString() ?? null,
    },
  };
}
