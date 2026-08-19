import mongoose from "mongoose";

import { APPROVED_VENDOR_FILTER } from "@/lib/vendorGate";
import User from "@/model/user.model";

/**
 * Quy tắc "sản phẩm này có được bán hay không", dùng chung cho mọi bề mặt.
 *
 * Sản phẩm đã duyệt và đang hiển thị vẫn chưa đủ: nhà bán sở hữu nó cũng phải đang được duyệt.
 * Trước đây các truy vấn công khai chỉ kiểm hai điều kiện đầu, nên khi một nhà bán bị chuyển về
 * `pending` hay `rejected`, sản phẩm của họ vẫn nằm trong danh sách, vẫn thêm được vào giỏ và
 * vẫn đặt hàng được.
 *
 * Điều kiện về nhà bán được kiểm ở THỜI ĐIỂM ĐỌC, không ghi cờ xuống từng sản phẩm. Nhờ vậy một
 * lần đổi trạng thái nhà bán có hiệu lực ngay, không phải cập nhật hàng loạt document, và không
 * có nguy cơ cờ trên sản phẩm lệch với sự thật trên tài khoản.
 */
export const SELLABLE_PRODUCT_FILTER = {
  isActive: true,
  verificationStatus: "approved",
} as const;

/**
 * ID của mọi nhà bán đang được duyệt.
 *
 * Một truy vấn phụ cho mỗi lượt đọc danh sách. Đánh đổi này là có ý thức: cách còn lại là
 * `$lookup` trong aggregate, nhưng nó buộc phải viết lại toàn bộ các endpoint đang dùng
 * `find().populate()`, và số nhà bán của hệ thống nhỏ hơn nhiều so với số sản phẩm.
 */
export async function approvedVendorIds(): Promise<mongoose.Types.ObjectId[]> {
  const vendors = await User.find(APPROVED_VENDOR_FILTER)
    .select("_id")
    .lean<Array<{ _id: mongoose.Types.ObjectId }>>();
  return vendors.map((v) => v._id);
}

/** Bộ lọc sản phẩm đầy đủ: sản phẩm hợp lệ VÀ nhà bán đang được duyệt. */
export async function sellableProductFilter(): Promise<
  Record<string, unknown>
> {
  return {
    ...SELLABLE_PRODUCT_FILTER,
    vendor: { $in: await approvedVendorIds() },
  };
}

/** Một nhà bán cụ thể có đang được phép bán hay không. */
export async function isVendorSellable(
  vendorId: unknown,
): Promise<boolean> {
  if (!vendorId || !mongoose.Types.ObjectId.isValid(String(vendorId))) {
    return false;
  }
  const found = await User.exists({
    _id: vendorId,
    ...APPROVED_VENDOR_FILTER,
  });
  return found !== null;
}
