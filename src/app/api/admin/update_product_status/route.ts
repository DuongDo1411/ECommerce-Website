import connectDB from "@/lib/connectDB";
import { requireRole } from "@/lib/rbac";
import { isVendorSellable } from "@/lib/sellable";
import { VENDOR_CODES } from "@/lib/vendorGate";
import Product from "@/model/product.model";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const authz = await requireRole(["admin"], { mode: "api" });
    if (authz instanceof NextResponse) return authz;
    const { productId, status, rejectedReason } = await req.json();
    if (!productId || !status) {
      return NextResponse.json(
        { message: "Product ID and status are required" },
        { status: 400 },
      );
    }

    const product = await Product.findById(productId);
    if (!product) {
      return NextResponse.json({ message: "Product not found" }, { status: 404 });
    }

    // Duyệt sản phẩm là hành động đưa nó lên các bề mặt công khai, nên cửa hàng sở hữu nó
    // cũng phải đang được duyệt. Thiếu bước này thì quản trị viên có thể vô tình mở bán cho
    // một cửa hàng đang chờ xét hoặc đã bị từ chối.
    if (status === "approved" && !(await isVendorSellable(product.vendor))) {
      return NextResponse.json(
        {
          code: VENDOR_CODES.notSellable,
          message:
            "Cửa hàng sở hữu sản phẩm này chưa được duyệt, nên chưa thể duyệt sản phẩm.",
        },
        { status: 409 },
      );
    }

    if (status === "approved") {
      product.verificationStatus = "approved";
      product.approvedAt = new Date();
      product.rejectedReason = undefined;
    }

    if (status === "rejected") {
      product.verificationStatus = "rejected";
      product.rejectedReason =
        rejectedReason ||
        "Your application has been rejected by the admin. Please contact admin for more information";
    }

    await product.save();

    return NextResponse.json(
      { message: "Product status updated successfully", product },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: `Product status update error ${error}` },
      { status: 500 },
    );
  }
}
