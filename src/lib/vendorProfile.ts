/**
 * Hồ sơ cửa hàng đã đủ để bán hàng hay chưa.
 *
 * Hai câu hỏi khác nhau, và tách chúng ra là cần thiết:
 *
 * - `isVendorProfileComplete` chỉ nói về DỮ LIỆU. Quản trị viên dùng nó để quyết định có duyệt
 *   được hay không, nên nó không được nhìn vào trạng thái duyệt.
 * - `isVendorProfileIncomplete` nói về VIỆC CẦN LÀM của nhà bán, nên nó tính cả "draft": đó là
 *   nhà bán vừa kích hoạt và chưa từng gửi hồ sơ, dù dữ liệu có sẵn thì cũng chưa ai nhận được.
 *
 * Số điện thoại được kiểm ĐỊNH DẠNG chứ không chỉ kiểm rỗng: nó là `from_phone` duy nhất gửi
 * tới GHN khi tạo vận đơn, và một chuỗi rác ở đây làm nhân viên lấy hàng không gọi được cho ai.
 */
export const VN_PHONE_PATTERN = /^0\d{9}$/;

/**
 * Mã số thuế cũng kiểm ĐỊNH DẠNG chứ không chỉ kiểm rỗng, theo Điều 5 Thông tư 86/2024/TT-BTC
 * của Bộ Tài chính (ban hành 23/12/2024, hiệu lực từ 06/02/2025):
 * - 10 chữ số: mã số thuế của đơn vị độc lập (doanh nghiệp, tổ chức có tư cách pháp nhân).
 * - 13 chữ số, có dấu gạch ngang phân tách 10 số đầu và 3 số cuối: mã số thuế của đơn vị phụ
 *   thuộc, trong đó 10 số đầu là mã đơn vị chủ quản và 3 số cuối là số thứ tự đơn vị phụ thuộc.
 * Trước khi có kiểm này, trường chấp nhận bất kỳ chuỗi nào miễn không rỗng.
 */
export const VN_TAX_NUMBER_PATTERN = /^\d{10}(-\d{3})?$/;

export interface VendorProfileFields {
  phone?: string;
  shopName?: string;
  shopAddress?: string;
  taxNumber?: string;
  verificationStatus?: string;
  shopAddressDetail?: {
    address?: string;
    wardCode?: string;
    wardName?: string;
    districtId?: number;
    districtName?: string;
    provinceId?: number;
    provinceName?: string;
  } | null;
}

const filled = (value?: string) => typeof value === "string" && value.trim().length > 0;

export function isVendorProfileComplete(user: VendorProfileFields): boolean {
  const detail = user.shopAddressDetail;
  return (
    VN_PHONE_PATTERN.test((user.phone ?? "").trim()) &&
    filled(user.shopName) &&
    filled(user.shopAddress) &&
    VN_TAX_NUMBER_PATTERN.test((user.taxNumber ?? "").trim()) &&
    !!detail &&
    filled(detail.address) &&
    filled(detail.wardCode) &&
    filled(detail.wardName) &&
    filled(detail.districtName) &&
    filled(detail.provinceName) &&
    Number.isInteger(detail.districtId) &&
    (detail.districtId ?? 0) > 0 &&
    Number.isInteger(detail.provinceId) &&
    (detail.provinceId ?? 0) > 0
  );
}

export function isVendorProfileIncomplete(user: VendorProfileFields): boolean {
  return user.verificationStatus === "draft" || !isVendorProfileComplete(user);
}
