"use client";
import UseGetAllProducts from "./hooks/UseGetAllProductsData";
import UseGetCurrentUser from "./hooks/UseGetCurrentUser";

/**
 * Nạp dữ liệu dùng chung cho mọi trang.
 *
 * KHÔNG nạp danh sách nhà bán ở đây nữa. Trước đây `UseGetAllVendors` gọi
 * `/api/vendor/AllVendor` trên mọi lần tải trang, nên email, số điện thoại, mã số thuế và
 * địa chỉ kho của toàn bộ nhà bán được gửi về máy của cả những khách chưa đăng nhập. Dữ liệu
 * đó giờ chỉ quản trị viên đọc được, qua `/api/admin/vendors`, và trang quản trị tự nạp khi
 * cần. Dữ liệu gian hàng cho người mua đi bằng `/api/shop`.
 */
function InitUser() {
  UseGetCurrentUser();
  UseGetAllProducts();
  return null;
}

export default InitUser;
