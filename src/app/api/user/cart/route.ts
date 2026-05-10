import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import Product from "@/model/product.model";
import { NextResponse } from "next/server";

// GET /api/user/cart — Lấy giỏ hàng + populate thông tin sản phẩm
export async function GET() {
  try {
    await connectDB();
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const user = await User.findById(session.user.id)
      .select("cart")
      .populate({
        path: "cart.product",
        select: "title price image1 stock isStockAvailable freeDelivery payOnDelivery vendor",
        populate: { path: "vendor", select: "shopName name" },
      });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ cart: user.cart ?? [] }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ message: `Error: ${error}` }, { status: 500 });
  }
}

// POST /api/user/cart — Thêm sản phẩm vào giỏ hàng
export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { productId, quantity = 1 } = await req.json();
    if (!productId) {
      return NextResponse.json(
        { message: "productId is required" },
        { status: 400 },
      );
    }

    const product = await Product.findById(productId);
    if (!product || !product.isStockAvailable) {
      return NextResponse.json(
        { message: "Sản phẩm không tồn tại hoặc đã hết hàng" },
        { status: 400 },
      );
    }

    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    user.cart = user.cart ?? [];
    const existingIndex = user.cart.findIndex(
      (item: any) => item.product?.toString() === productId,
    );

    if (existingIndex >= 0) {
      // Tăng số lượng nếu đã có
      user.cart[existingIndex].quantity = Math.min(
        (user.cart[existingIndex].quantity ?? 1) + quantity,
        product.stock ?? 99,
      );
    } else {
      user.cart.push({ product: productId, quantity });
    }

    await user.save();
    return NextResponse.json(
      { message: "Đã thêm vào giỏ hàng!", cartCount: user.cart.length },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json({ message: `Error: ${error}` }, { status: 500 });
  }
}
