import { requireRole } from "@/lib/rbac";
import EditVendorDetails from "../../component/Vendor/EditVendorDetails";

/**
 * Trang khai và sửa hồ sơ cửa hàng, mở cho MỌI nhà bán ở bất kỳ trạng thái nào.
 *
 * Cần một đường dẫn riêng vì `/vendor` chỉ hiện form khi hồ sơ còn thiếu. Nhà bán bị từ chối
 * thường có hồ sơ đầy đủ — chỉ là quản trị viên không chấp nhận nội dung — nên họ không bao giờ
 * thấy form đó, và trước đây họ chỉ có một ô nhập địa chỉ dạng chữ tự do. Địa chỉ như vậy không
 * dùng được cho GHN, vốn cần mã tỉnh, quận và phường.
 *
 * KHÔNG áp guard "đã được duyệt": đúng những nhà bán chưa được duyệt mới cần trang này.
 */
export default async function VendorProfilePage() {
  await requireRole(["vendor"]);

  return <EditVendorDetails />;
}
