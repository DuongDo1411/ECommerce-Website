import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import Order from "@/model/order.model";
import Product from "@/model/product.model";
import User from "@/model/user.model";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const session = await auth();

    if (!session || !session.user?.id || !session.user.email) {
      return NextResponse.json(
        { message: "Unauthorized User" },
        { status: 400 },
      );
    }
    const userId = session.user?.id;

    const {
      productId,
      quantity,
      addressId,
      serviceId,
      amount,
      deliveryCharge,
      serviceCharge,
      size,
    } = await req.json();

    if (!productId || !quantity) {
      return NextResponse.json(
        { message: "ProductId and quantity required" },
        { status: 400 },
      );
    }

    if (!addressId) {
      return NextResponse.json(
        { message: "Vui lòng chọn địa chỉ giao hàng" },
        { status: 400 },
      );
    }

    if (
      typeof amount !== "number" ||
      typeof deliveryCharge !== "number" ||
      typeof serviceCharge !== "number"
    ) {
      return NextResponse.json(
        { message: "Invalid amount, delivery or service charge" },
        { status: 400 },
      );
    }

    const user = await User.findById(userId);

    if (!user || !user.cart) {
      return NextResponse.json(
        { message: "User or cart not found" },
        { status: 404 },
      );
    }

    // Snapshot the chosen saved address into the order (GHN-structured).
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

    const cartItem = user.cart.find(
      (item: any) =>
        item.product._id.toString() === productId.toString() &&
        (item.size ?? null) === (size ?? null),
    );

    if (!cartItem) {
      return NextResponse.json(
        { message: "Product not found in cart" },
        { status: 404 },
      );
    }

    const product = await Product.findById(productId);

    if (!product) {
      return NextResponse.json(
        { message: "Product not found" },
        { status: 404 },
      );
    }

    // Kiểm tra tồn kho theo size (wearable) hoặc tổng (non-wearable)
    if (product.isWearable && size) {
      const sizeEntry = (product.sizeStock ?? []).find(
        (s: { size: string; stock: number }) => s.size === size,
      );
      if (!sizeEntry || sizeEntry.stock < quantity) {
        return NextResponse.json(
          { message: `Không đủ hàng cho size ${size} của sản phẩm ${product.title}` },
          { status: 400 },
        );
      }
    } else if (product.stock < quantity) {
      return NextResponse.json(
        { message: `Insufficient stock for ${product.title}` },
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

      paymentMethod: "cod",
      isPaid: false,
      orderStatus: "pending",
      returnedAmount: 0,

      address,
      ghn: { serviceId, visibleToCustomer: false },
    });
    // Khấu trừ tồn kho
    if (product.isWearable && size) {
      // Giảm stock của đúng size và giảm tổng stock
      await Product.findByIdAndUpdate(
        productId,
        {
          $inc: {
            "sizeStock.$[elem].stock": -quantity,
            stock: -quantity,
          },
        },
        { arrayFilters: [{ "elem.size": size }] },
      );
      // Cập nhật isStockAvailable dựa theo tổng mới
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
      await Product.findByIdAndUpdate(productId, {
        $inc: { stock: -quantity },
      });
      // Cập nhật isStockAvailable
      const updated = await Product.findById(productId);
      if (updated) {
        await Product.findByIdAndUpdate(productId, {
          isStockAvailable: updated.stock > 0,
        });
      }
    }

    user.cart = user.cart.filter(
      (item: any) =>
        !(
          item.product._id.toString() === productId.toString() &&
          (item.size ?? null) === (size ?? null)
        ),
    );
    user.orders.push(order._id);
    await user.save();

    return NextResponse.json(
      {
        message: "✅ COD Order placed successfully",
        order,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: `failed to Create order in COD ${error}` },
      { status: 500 },
    );
  }
}
