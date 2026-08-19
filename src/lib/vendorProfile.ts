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
    filled(user.taxNumber) &&
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
