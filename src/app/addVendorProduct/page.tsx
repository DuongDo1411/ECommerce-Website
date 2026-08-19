import { redirect } from "next/navigation";

import { requireRole } from "@/lib/rbac";
import { isVendorApproved } from "@/lib/vendorGate";

import AddProductForm from "./AddProductForm";

/**
 * Chặn ở phía server cho trang thêm sản phẩm.
 *
 * Form nằm trong một client component, nên trước đây lớp chặn duy nhất là giao diện: điều hướng
 * thẳng tới đường dẫn này vẫn mở được form, và người dùng vẫn bấm gửi được. Route
 * `/api/vendor/addProduct` giờ đã tự từ chối, nhưng để form mở ra rồi mới báo lỗi là bắt người
 * dùng gõ xong cả sản phẩm mới biết mình chưa được phép.
 */
export default async function AddVendorProductPage() {
  const { user } = await requireRole(["vendor"]);

  if (!isVendorApproved(user)) {
    redirect("/vendor");
  }

  return <AddProductForm />;
}
