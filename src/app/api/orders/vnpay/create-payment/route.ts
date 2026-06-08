import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import { createVnpayUrl } from "@/lib/vnpay";
import Order from "@/model/order.model";
import Product from "@/model/product.model";
import User from "@/model/user.model";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

interface CartItemPayload {
  productId: string;
  quantity: number;
  size?: string;
  serviceId?: number;
  deliveryCharge: number;
  serviceCharge: number;
  amount: number;
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { items, addressId, totalAmount } = (await req.json()) as {
      items: CartItemPayload[];
      addressId: string;
      totalAmount: number;
    };

    if (!items?.length || !addressId || typeof totalAmount !== "number") {
      return NextResponse.json(
        { message: "Thiếu thông tin đặt hàng" },
        { status: 400 },
      );
    }

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json(
        { message: "Không tìm thấy người dùng" },
        { status: 404 },
      );
    }

    const src = user.addresses?.find(
      (a: any) => a._id.toString() === addressId.toString(),
    );
    if (!src) {
      return NextResponse.json(
        { message: "Địa chỉ giao hàng không tồn tại" },
        { status: 404 },
      );
    }

    const address = {
      name: src.fullName,
      phone: src.phone,
      address: `${src.addressDetail}, ${src.wardName}, ${src.districtName}, ${src.provinceName}`,
      city: src.provinceName,
      pincode: "",
      addressDetail: src.addressDetail,
      wardCode: src.wardCode,
      wardName: src.wardName,
      districtId: src.districtId,
      districtName: src.districtName,
      provinceId: src.provinceId,
      provinceName: src.provinceName,
    };

    // Shared transaction ref for all orders in this checkout batch
    const txnRef = crypto.randomUUID().replace(/-/g, "").slice(0, 20);

    const orderIds: string[] = [];

    for (const item of items) {
      const { productId, quantity, size, serviceId, deliveryCharge, serviceCharge, amount } = item;

      const product = await Product.findById(productId);
      if (!product) {
        return NextResponse.json(
          { message: `Sản phẩm không tồn tại` },
          { status: 404 },
        );
      }

      // Stock validation
      if (product.isWearable && size) {
        const sizeEntry = (product.sizeStock ?? []).find(
          (s: { size: string; stock: number }) => s.size === size,
        );
        if (!sizeEntry || sizeEntry.stock < quantity) {
          return NextResponse.json(
            { message: `Không đủ hàng cho size ${size} của ${product.title}` },
            { status: 400 },
          );
        }
      } else if (product.stock < quantity) {
        return NextResponse.json(
          { message: `Không đủ hàng cho ${product.title}` },
          { status: 400 },
        );
      }

      const productsTotal = product.price * quantity;

      const order = await Order.create({
        buyer: userId,
        products: [
          {
            product: product._id,
            quantity,
            price: product.price,
            ...(size ? { size } : {}),
          },
        ],
        productVendor: product.vendor,
        productsTotal,
        deliveryCharge,
        serviceCharge,
        totalAmount: amount,
        paymentMethod: "vnpay",
        isPaid: false,
        orderStatus: "pending",
        returnedAmount: 0,
        address,
        ghn: { serviceId, visibleToCustomer: false },
        paymentDetails: { vnpayTxnRef: txnRef },
      });

      orderIds.push(order._id.toString());

      // Deduct stock immediately (same as COD)
      if (product.isWearable && size) {
        await Product.findByIdAndUpdate(
          productId,
          { $inc: { "sizeStock.$[elem].stock": -quantity, stock: -quantity } },
          { arrayFilters: [{ "elem.size": size }] },
        );
        const updated = await Product.findById(productId);
        if (updated) {
          const newTotal = (updated.sizeStock ?? []).reduce(
            (sum: number, s: { size: string; stock: number }) => sum + s.stock,
            0,
          );
          await Product.findByIdAndUpdate(productId, {
            isStockAvailable: newTotal > 0,
            stock: newTotal,
          });
        }
      } else {
        await Product.findByIdAndUpdate(productId, { $inc: { stock: -quantity } });
        const updated = await Product.findById(productId);
        if (updated) {
          await Product.findByIdAndUpdate(productId, {
            isStockAvailable: updated.stock > 0,
          });
        }
      }

      user.orders.push(order._id);
    }

    // Clear purchased items from cart
    const purchasedIds = new Set(items.map((i) => i.productId));
    user.cart = user.cart.filter(
      (c: any) => !purchasedIds.has(c.product._id.toString()),
    );
    await user.save();

    // Get client IP
    const forwarded = req.headers.get("x-forwarded-for");
    const ipAddr = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";

    const paymentUrl = createVnpayUrl({
      txnRef,
      amount: totalAmount,
      orderInfo: `Thanh toan don hang ${txnRef}`,
      ipAddr,
    });

    return NextResponse.json({ paymentUrl, txnRef, orderIds }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: `Lỗi tạo đơn hàng VNPay: ${error}` },
      { status: 500 },
    );
  }
}
