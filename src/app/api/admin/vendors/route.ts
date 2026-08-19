import { NextResponse } from "next/server";

import connectDB from "@/lib/connectDB";
import { requireRole } from "@/lib/rbac";
import Product from "@/model/product.model";
import User from "@/model/user.model";

interface LeanVendor {
  _id: unknown;
  name?: string;
  email?: string;
  phone?: string;
  image?: string;
  shopName?: string;
  shopAddress?: string;
  shopAddressDetail?: unknown;
  taxNumber?: string;
  isApproved?: boolean;
  verificationStatus?: string;
  rejectedReason?: string;
  requestedAt?: Date | null;
  approvedAt?: Date | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

/**
 * Danh sách nhà bán cho trang quản trị.
 *
 * Thay cho `/api/vendor/AllVendor` trước đây. Route cũ nằm trong danh sách API công khai của
 * proxy và trả về email, số điện thoại, mã số thuế cùng địa chỉ kho của MỌI nhà bán cho bất
 * kỳ ai gọi tới, không cần tài khoản. Nó còn được nạp trong `InitUser` nên mọi khách vào
 * trang chủ đều kéo trọn bộ dữ liệu đó về máy mình.
 *
 * Dữ liệu gian hàng dành cho người mua đi bằng đường riêng là `/api/shop`, và đường đó chỉ
 * trả nhà bán đã được duyệt.
 */
export async function GET() {
  try {
    const authz = await requireRole(["admin"], { mode: "api" });
    if (authz instanceof NextResponse) return authz;

    await connectDB();

    // Chỉ hai trạng thái này là hồ sơ có thật để quản trị viên xem xét. "draft" là nhà bán
    // vừa kích hoạt mà chưa khai gì, đưa vào đây chỉ tạo những dòng rỗng trong hàng chờ.
    const vendors = await User.find({
      role: "vendor",
      verificationStatus: { $in: ["pending", "approved"] },
    })
      .select(
        "_id name email phone image shopName shopAddress shopAddressDetail taxNumber isApproved verificationStatus rejectedReason requestedAt approvedAt createdAt updatedAt",
      )
      .sort({ createdAt: -1 })
      .lean<LeanVendor[]>();

    const enriched = await Promise.all(
      vendors.map(async (v) => {
        const [totalProducts, approvedProducts] = await Promise.all([
          Product.countDocuments({ vendor: v._id }),
          Product.countDocuments({
            vendor: v._id,
            verificationStatus: "approved",
            isActive: true,
          }),
        ]);
        return {
          _id: String(v._id),
          name: v.name ?? "",
          email: v.email ?? "",
          phone: v.phone ?? "",
          image: v.image ?? null,
          shopName: v.shopName ?? "",
          shopAddress: v.shopAddress ?? "",
          shopAddressDetail: v.shopAddressDetail ?? null,
          taxNumber: v.taxNumber ?? "",
          isApproved: v.isApproved ?? false,
          verificationStatus: v.verificationStatus ?? "pending",
          rejectedReason: v.rejectedReason ?? "",
          requestedAt: v.requestedAt ?? null,
          approvedAt: v.approvedAt ?? null,
          createdAt: v.createdAt ?? null,
          // Thẻ phiên bản của hồ sơ. Quản trị viên gửi nó lại khi duyệt, và server chỉ ghi khi
          // giá trị còn khớp — nhà bán sửa hồ sơ sau lúc mở modal sẽ làm lượt duyệt đó thất bại
          // thay vì duyệt một bản đã cũ.
          updatedAt: v.updatedAt ?? null,
          totalProducts,
          approvedProducts,
        };
      }),
    );

    return NextResponse.json({ vendors: enriched }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: `Khong lay duoc danh sach nha ban: ${error}` },
      { status: 500 },
    );
  }
}
