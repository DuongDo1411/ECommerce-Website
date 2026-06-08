import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import { NextResponse } from "next/server";

// PATCH /api/user/cart/[productId]?size=M — Cập nhật số lượng
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  try {
    await connectDB();
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { productId } = await params;
    const size = new URL(req.url).searchParams.get("size") ?? undefined;
    const { quantity } = await req.json();

    if (!quantity || quantity < 1) {
      return NextResponse.json({ message: "Số lượng không hợp lệ" }, { status: 400 });
    }

    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const item = user.cart?.find(
      (c: any) =>
        c.product?.toString() === productId &&
        (c.size ?? null) === (size ?? null),
    );
    if (!item) {
      return NextResponse.json({ message: "Sản phẩm không có trong giỏ" }, { status: 404 });
    }

    item.quantity = quantity;
    await user.save();

    return NextResponse.json({ message: "Đã cập nhật số lượng" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ message: `Error: ${error}` }, { status: 500 });
  }
}

// DELETE /api/user/cart/[productId]?size=M — Xóa sản phẩm khỏi giỏ
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  try {
    await connectDB();
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { productId } = await params;
    const size = new URL(req.url).searchParams.get("size") ?? undefined;

    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    user.cart = (user.cart ?? []).filter(
      (c: any) =>
        !(
          c.product?.toString() === productId &&
          (c.size ?? null) === (size ?? null)
        ),
    );
    await user.save();

    return NextResponse.json({ message: "Đã xóa khỏi giỏ hàng" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ message: `Error: ${error}` }, { status: 500 });
  }
}
