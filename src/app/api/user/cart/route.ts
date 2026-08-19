import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import { isVendorSellable, SELLABLE_PRODUCT_FILTER } from "@/lib/sellable";
import { isVendorApproved, VENDOR_CODES } from "@/lib/vendorGate";
import User from "@/model/user.model";
import Product from "@/model/product.model";
import type { CartItemSubdoc } from "@/types/cart";
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
        select:
          "title price image1 stock isStockAvailable sizeStock freeDelivery payOnDelivery vendor isWearable isActive verificationStatus",
        populate: {
          path: "vendor",
          select: "shopName name role verificationStatus isApproved",
        },
      })
      .lean();

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    // Giỏ hàng có thể nằm đó rất lâu. Trong khoảng đó sản phẩm có thể bị ẩn, bị gỡ duyệt, hoặc
    // cửa hàng bị chuyển về chờ xét. Đánh dấu từng dòng thay vì lọc chúng khỏi phản hồi: người
    // mua cần thấy món hàng đó để tự xoá, còn lọc đi thì nó biến mất một cách không giải thích
    // và giỏ vẫn chặn thanh toán mà không rõ vì sao.
    const items = (user.cart ?? []).map((item: Record<string, unknown>) => {
      const product = item.product as unknown as {
        isActive?: boolean;
        verificationStatus?: string;
        vendor?: {
          role?: string;
          verificationStatus?: string;
          isApproved?: boolean;
        } | null;
      } | null;

      if (!product) {
        return { ...item, purchasable: false, unpurchasableReason: "Sản phẩm không còn tồn tại." };
      }

      const productOk =
        product.isActive === true && product.verificationStatus === "approved";
      if (!productOk) {
        return { ...item, purchasable: false, unpurchasableReason: "Sản phẩm này hiện không bán." };
      }

      if (!product.vendor || !isVendorApproved(product.vendor)) {
        return {
          ...item,
          purchasable: false,
          unpurchasableReason: "Cửa hàng bán sản phẩm này đang tạm ngưng.",
        };
      }

      return { ...item, purchasable: true };
    });

    return NextResponse.json({ cart: items }, { status: 200 });
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

    // Sản phẩm phải còn bán được, và nhà bán sở hữu nó phải đang được duyệt. Không kiểm ở đây
    // thì sản phẩm của một cửa hàng đang tạm ngưng vẫn vào được giỏ, rồi mắc lại ở bước thanh
    // toán — người mua chọn hàng xong mới biết mình không mua được.
    const sellable =
      product.isActive === SELLABLE_PRODUCT_FILTER.isActive &&
      product.verificationStatus ===
        SELLABLE_PRODUCT_FILTER.verificationStatus &&
      (await isVendorSellable(product.vendor));
    if (!sellable) {
      return NextResponse.json(
        {
          code: VENDOR_CODES.notSellable,
          message: "Sản phẩm này hiện không bán. Vui lòng chọn sản phẩm khác.",
        },
        { status: 409 },
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
      (item: CartItemSubdoc) =>
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
