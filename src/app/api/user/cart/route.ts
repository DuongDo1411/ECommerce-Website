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
        select: "title price image1 stock isStockAvailable sizeStock freeDelivery payOnDelivery vendor isWearable",
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

    const { productId, quantity = 1, size } = await req.json();
    if (!productId) {
      return NextResponse.json(
        { message: "productId is required" },
        { status: 400 },
      );
    }

    const product = await Product.findById(productId);
    if (!product) {
      return NextResponse.json(
        { message: "Sản phẩm không tồn tại" },
        { status: 400 },
      );
    }

    // Kiểm tra tồn kho theo size (wearable) hoặc tổng (non-wearable)
    if (product.isWearable && size) {
      const sizeEntry = (product.sizeStock ?? []).find(
        (s: { size: string; stock: number }) => s.size === size,
      );
      if (!sizeEntry || sizeEntry.stock === 0) {
        return NextResponse.json(
          { message: `Size ${size} đã hết hàng` },
          { status: 400 },
        );
      }
    } else if (!product.isStockAvailable) {
      return NextResponse.json(
        { message: "Sản phẩm đã hết hàng" },
        { status: 400 },
      );
    }

    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    user.cart = user.cart ?? [];

    // Tìm cart item theo (productId, size) — cùng sản phẩm khác size là 2 dòng riêng
    const existingIndex = user.cart.findIndex(
      (item: any) =>
        item.product?.toString() === productId &&
        (item.size ?? null) === (size ?? null),
    );

    if (existingIndex >= 0) {
      const maxStock = product.isWearable && size
        ? ((product.sizeStock ?? []).find(
            (s: { size: string; stock: number }) => s.size === size,
          )?.stock ?? 99)
        : (product.stock ?? 99);
      user.cart[existingIndex].quantity = Math.min(
        (user.cart[existingIndex].quantity ?? 1) + quantity,
        maxStock,
      );
    } else {
      user.cart.push({ product: productId, quantity, ...(size ? { size } : {}) });
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
