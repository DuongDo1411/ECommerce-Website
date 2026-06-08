import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import Order from "@/model/order.model";
import Product from "@/model/product.model";
import { NextRequest, NextResponse } from "next/server";

/**
 * PATCH /api/orders/[orderId]
 * User tự hủy đơn — chỉ cho phép khi orderStatus === "pending"
 * Sau khi hủy, hoàn lại tồn kho (tổng + theo size nếu có)
 */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    await connectDB();
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { orderId } = await params;

    const order = await Order.findOne({
      _id: orderId,
      buyer: session.user.id,
    });

    if (!order) {
      return NextResponse.json(
        { message: "Không tìm thấy đơn hàng" },
        { status: 404 },
      );
    }

    // Chỉ cho phép hủy khi đơn đang ở trạng thái "pending"
    if (order.orderStatus !== "pending") {
      return NextResponse.json(
        {
          message:
            "Chỉ có thể hủy đơn khi đơn hàng đang chờ xử lý (pending). Liên hệ người bán để hủy.",
        },
        { status: 400 },
      );
    }

    // ── Hoàn lại tồn kho cho từng sản phẩm trong đơn ──
    for (const item of order.products) {
      const productId =
        (item.product as any)?._id?.toString?.() ?? item.product.toString();
      const size: string | null = (item as any).size ?? null;

      if (size) {
        // Sản phẩm có size: hoàn cả sizeStock[size].stock lẫn stock tổng
        await Product.findByIdAndUpdate(
          productId,
          {
            $inc: {
              "sizeStock.$[elem].stock": item.quantity,
              stock: item.quantity,
            },
          },
          { arrayFilters: [{ "elem.size": size }] },
        );
      } else {
        // Sản phẩm không có size: chỉ hoàn stock tổng
        await Product.findByIdAndUpdate(productId, {
          $inc: { stock: item.quantity },
        });
      }

      // Đảm bảo sản phẩm được đánh dấu còn hàng
      await Product.findByIdAndUpdate(productId, {
        isStockAvailable: true,
      });
    }

    order.orderStatus = "cancelled";
    order.cancelledAt = new Date();
    await order.save();

    return NextResponse.json(
      { message: "Đã hủy đơn hàng thành công", orderStatus: "cancelled" },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: `Lỗi hủy đơn: ${error}` },
      { status: 500 },
    );
  }
}
