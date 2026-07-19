import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import {
  computeReturnEligibleUntil,
  computeReturnWindowDays,
} from "@/lib/returns/policy";
import Order from "@/model/order.model";
import "@/model/product.model";
// Order.returnRequest là ref tới model này; phải đăng ký schema trước khi populate.
import "@/model/returnRequest.model";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await connectDB();
    const session = await auth();

    if (!session || !session.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const orders = await Order.find({ buyer: session.user.id })
      .populate({
        path: "products.product",
        select: "title image1 price replacementDays",
      })
      .populate({
        path: "productVendor",
        select: "shopName name",
      })
      // Tóm tắt case hoàn trả để trang đơn hàng biết nên hiện nút "Trả hàng" hay hiện
      // trạng thái yêu cầu đang chạy. Không trả history/evidence — danh sách đơn không
      // cần, và đó là dữ liệu của case chứ không phải của đơn.
      .populate({
        path: "returnRequest",
        select:
          "status caseType resolution refund.amount refund.status shipping.status shipping.trackingCode createdAt",
      })
      .sort({ createdAt: -1 })
      .lean();

    // Orders created before policy snapshots use the product policy currently in
    // effect until the migration (or the first return request) locks a snapshot.
    const rows = orders.map((order) => {
      if (typeof order.returnWindowDaysSnapshot === "number") return order;
      const windowDays = computeReturnWindowDays(
        (order.products ?? []).map((item: { product?: unknown }) => {
          const product = item.product as { replacementDays?: number } | null;
          return product?.replacementDays;
        }),
      );
      return {
        ...order,
        returnWindowDaysSnapshot: windowDays,
        returnEligibleUntil:
          computeReturnEligibleUntil(order.deliveryDate, windowDays) ??
          undefined,
      };
    });

    return NextResponse.json({ orders: rows }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "Khong the tai don hang" },
      { status: 500 },
    );
  }
}
