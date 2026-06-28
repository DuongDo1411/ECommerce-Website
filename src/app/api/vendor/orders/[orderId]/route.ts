import connectDB from "@/lib/connectDB";
import {
  cancelGHNOrder,
  createGHNOrder,
  GHNError,
  pickServiceId,
} from "@/lib/ghn";
import {
  commitBatchIfTerminalWithDelivery,
  markRefundForCancelledOrder,
  releaseBatchIfFullyCancelled,
} from "@/lib/voucher/lifecycle";
import { requireRole } from "@/lib/rbac";
import Order from "@/model/order.model";
import Product from "@/model/product.model";
import User from "@/model/user.model";
import { NextRequest, NextResponse } from "next/server";

// Vendor may only move an order through these states.
const VALID_STATUSES = ["confirmed", "shipped", "delivered", "cancelled"];

type PopulatedProduct = {
  _id?: { toString?: () => string };
  title?: string;
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
};

type VendorOrderItem = {
  product: PopulatedProduct & { toString: () => string };
  quantity: number;
  price: number;
  size?: string | null;
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    await connectDB();
    const authz = await requireRole(["vendor"], { mode: "api" });
    if (authz instanceof NextResponse) return authz;
    const { session } = authz;

    const { orderId } = await params;
    const { orderStatus } = await req.json();

    if (!VALID_STATUSES.includes(orderStatus)) {
      return NextResponse.json({ message: "Invalid status" }, { status: 400 });
    }

    const order = await Order.findOne({
      _id: orderId,
      productVendor: session.user.id,
    });

    if (!order) {
      return NextResponse.json(
        { message: "Order not found or not yours" },
        { status: 404 },
      );
    }

    /* ── pending → confirmed: create the GHN shipping order ── */
    if (orderStatus === "confirmed" && order.orderStatus === "pending") {
      if (order.ghn?.orderCode) {
        // Already created (idempotent retry): just move to confirmed.
        order.orderStatus = "confirmed";
        await order.save();
        return NextResponse.json(
          { message: "Đã xác nhận đơn", orderStatus: "confirmed" },
          { status: 200 },
        );
      }

      const vendor = await User.findById(session.user.id).select(
        "shopAddressDetail shopName phone",
      );
      const shop = vendor?.shopAddressDetail;
      if (!shop?.districtId || !shop?.wardCode) {
        return NextResponse.json(
          {
            message:
              "Bạn chưa cấu hình địa chỉ kho GHN. Vào Hồ sơ → Edit Shop Details để cập nhật.",
          },
          { status: 400 },
        );
      }
      if (!/^0\d{9}$/.test(String(vendor?.phone ?? "").trim())) {
        return NextResponse.json(
          {
            message:
              "Số điện thoại của shop không hợp lệ (cần 10 chữ số, bắt đầu bằng 0). Vào Hồ sơ → Edit Shop Details để cập nhật trước khi xác nhận đơn.",
          },
          { status: 400 },
        );
      }

      await order.populate(
        "products.product",
        "title weight length width height price",
      );

      let totalWeight = 0;
      let maxL = 0;
      let maxW = 0;
      let maxH = 0;
      const orderProducts = order.products as unknown as VendorOrderItem[];
      const items = orderProducts.map((p) => {
        const prod = p.product;
        const w = prod?.weight ?? 500;
        totalWeight += w * p.quantity;
        maxL = Math.max(maxL, prod?.length ?? 20);
        maxW = Math.max(maxW, prod?.width ?? 15);
        maxH = Math.max(maxH, prod?.height ?? 10);
        return {
          name: prod?.title ?? "Sản phẩm",
          quantity: p.quantity,
          weight: w,
          price: p.price,
        };
      });

      const addr = order.address;
      const serviceId =
        order.ghn?.serviceId ??
        (await pickServiceId(shop.districtId, addr.districtId));

      try {
        const result = await createGHNOrder({
          toName: addr.name,
          toPhone: addr.phone,
          toAddress: addr.address,
          toWardCode: String(addr.wardCode),
          toDistrictId: addr.districtId,
          fromName: vendor?.shopName ?? "Shop",
          fromPhone: vendor?.phone ?? "0000000000",
          fromAddress: shop.address,
          fromWardName: shop.wardName,
          fromDistrictName: shop.districtName,
          fromProvinceName: shop.provinceName,
          weight: totalWeight,
          length: maxL,
          width: maxW,
          height: maxH,
          serviceId,
          codAmount:
            order.paymentMethod === "cod" ? order.totalAmount : 0,
          insuranceValue: order.productsTotal,
          content: items.map((i) => i.name).join(", ").slice(0, 2000),
          clientOrderCode: order._id.toString(),
          items,
        });

        order.ghn = {
          ...(order.ghn ?? {}),
          orderCode: result.order_code,
          sortCode: result.sort_code,
          serviceId,
          fee: Number(result.total_fee) || order.deliveryCharge,
          expectedDeliveryTime: result.expected_delivery_time
            ? new Date(result.expected_delivery_time)
            : undefined,
          status: "ready_to_pick",
          visibleToCustomer: false,
        };
        order.orderStatus = "confirmed";
        await order.save();

        return NextResponse.json(
          {
            message: "Đã xác nhận & tạo vận đơn GHN",
            orderStatus: "confirmed",
            ghnOrderCode: result.order_code,
          },
          { status: 200 },
        );
      } catch (err) {
        console.error(err);
        const msg =
          err instanceof GHNError
            ? `GHN: ${err.message}`
            : "Loi tao van don GHN";
        // Order stays pending so the vendor can retry.
        return NextResponse.json({ message: msg }, { status: 500 });
      }
    }

    /* ── confirmed → shipped: reveal tracking code to the customer ── */
    if (orderStatus === "shipped") {
      if (!order.ghn?.orderCode) {
        return NextResponse.json(
          { message: "Đơn chưa có mã vận đơn GHN — hãy xác nhận đơn trước" },
          { status: 400 },
        );
      }
      order.ghn.visibleToCustomer = true;
      order.orderStatus = "shipped";
      await order.save();
      return NextResponse.json(
        { message: "Đã giao cho đơn vị vận chuyển", orderStatus: "shipped" },
        { status: 200 },
      );
    }

    /* ── shipped → delivered: vendor confirms successful delivery ── */
    if (orderStatus === "delivered") {
      if (order.orderStatus !== "shipped") {
        return NextResponse.json(
          { message: "Chỉ có thể xác nhận giao hàng khi đơn đang ở trạng thái 'Đã giao cho ĐVVC'" },
          { status: 400 },
        );
      }
      order.orderStatus = "delivered";
      order.isPaid = true;
      order.deliveryDate = new Date();
      await order.save();
      await commitBatchIfTerminalWithDelivery(order.checkoutBatchId);
      return NextResponse.json(
        { message: "Đã xác nhận giao hàng thành công", orderStatus: "delivered" },
        { status: 200 },
      );
    }

    /* ── any → cancelled: also cancel the GHN order if one exists ── */
    if (orderStatus === "cancelled") {
      // Chỉ hủy những đơn chưa delivered / chưa cancelled
      if (
        order.orderStatus === "delivered" ||
        order.orderStatus === "cancelled"
      ) {
        return NextResponse.json(
          { message: "Không thể hủy đơn hàng đã giao hoặc đã hủy" },
          { status: 400 },
        );
      }

      if (order.ghn?.orderCode) {
        const ok = await cancelGHNOrder(order.ghn.orderCode);
        if (!ok) {
          // GHN refused (likely already picked up) — diverge but allow.
          console.warn(
            `[GHN] could not cancel ${order.ghn.orderCode}; cancelling internally anyway`,
          );
        }
      }

      // ── Hoàn lại tồn kho cho từng sản phẩm trong đơn ──
      for (const item of order.products as unknown as VendorOrderItem[]) {
        const productId =
          item.product._id?.toString?.() ??
          item.product.toString();
        const size: string | null = item.size ?? null;

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
      markRefundForCancelledOrder(order);
      await order.save();
      const released = await releaseBatchIfFullyCancelled(order.checkoutBatchId);
      if (!released) {
        await commitBatchIfTerminalWithDelivery(order.checkoutBatchId);
      }
      return NextResponse.json(
        { message: "Đã hủy đơn", orderStatus: "cancelled" },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { message: "Chuyển trạng thái không hợp lệ" },
      { status: 400 },
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "Khong the cap nhat don hang" },
      { status: 500 },
    );
  }
}
