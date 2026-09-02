// Truy vấn dữ liệu thuần cho hai tool đọc của trợ lý AI — không gọi Gemini ở đây,
// nên test được độc lập (xem retrieval.test.ts).

import connectDB from "@/lib/connectDB";
import { approvedVendorIds } from "@/lib/sellable";
import Product from "@/model/product.model";
import Order from "@/model/order.model";
// Order.returnRequest là ref tới model này; phải đăng ký schema trước khi populate,
// đúng mẫu đã dùng ở src/app/api/orders/route.ts. Thiếu dòng này gây MissingSchemaError.
import "@/model/returnRequest.model";
import { getOrderStatusLabel } from "@/lib/orders/statusLabels";
import type { AssistantOrderCard, AssistantProductCard } from "@/lib/assistant/types";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface SearchProductsArgs {
  keywords?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  size?: string;
  payOnDelivery?: boolean;
  freeDelivery?: boolean;
  limit?: number;
}

interface SearchProductsLean {
  _id: unknown;
  title: string;
  price: number;
  image1: string;
  category: string;
  stock: number;
  isStockAvailable?: boolean;
  isWearable: boolean;
  sizeStock?: { size: string; stock: number }[];
  payOnDelivery?: boolean;
  freeDelivery?: boolean;
  warranty?: string;
  replacementDays?: number;
  vendor?: { shopName?: string; name?: string };
}

export async function searchProducts(
  args: SearchProductsArgs,
): Promise<AssistantProductCard[]> {
  await connectDB();

  const limit = Math.max(1, Math.min(Math.trunc(args.limit ?? 5), 8));

  // Bộ lọc cơ sở: chỉ sản phẩm đã duyệt, đang hiển thị và còn hàng thật.
  // `stock` được đồng bộ = tổng sizeStock lúc tạo/sửa sản phẩm (xem
  // vendor/addProduct và vendor/editProduct), nên áp dụng chung được cho cả
  // sản phẩm isWearable lẫn không.
  // Nhà bán cũng phải đang được duyệt. Thiếu điều kiện này thì trợ lý vẫn giới thiệu sản
  // phẩm của một shop đang bị tạm ngưng, và khách bấm vào sẽ không đặt được hàng.
  const filter: Record<string, unknown> = {
    isActive: true,
    verificationStatus: "approved",
    isStockAvailable: { $ne: false },
    stock: { $gt: 0 },
    vendor: { $in: await approvedVendorIds() },
  };

  if (args.keywords && args.keywords.trim()) {
    const rx = { $regex: escapeRegex(args.keywords.trim()), $options: "i" };
    filter.$or = [{ title: rx }, { category: rx }];
  }

  if (args.category && args.category.trim()) {
    filter.category = { $regex: escapeRegex(args.category.trim()), $options: "i" };
  }

  if (typeof args.minPrice === "number" && Number.isFinite(args.minPrice)) {
    filter.price = { ...(filter.price as object), $gte: Math.max(0, args.minPrice) };
  }
  if (typeof args.maxPrice === "number" && Number.isFinite(args.maxPrice)) {
    filter.price = { ...(filter.price as object), $lte: Math.max(0, args.maxPrice) };
  }

  if (typeof args.payOnDelivery === "boolean") {
    filter.payOnDelivery = args.payOnDelivery;
  }
  if (typeof args.freeDelivery === "boolean") {
    filter.freeDelivery = args.freeDelivery;
  }

  if (args.size && args.size.trim()) {
    // $elemMatch bắt buộc ĐÚNG một phần tử sizeStock vừa khớp size vừa còn
    // hàng — khác với lọc rời "sizeStock.size" (chỉ khớp tồn tại size, có thể
    // hết hàng) ghép với điều kiện stock ở cấp document (stock tổng có thể
    // dương nhờ size khác còn hàng, làm sai lệch kết quả).
    filter.sizeStock = { $elemMatch: { size: args.size.trim(), stock: { $gt: 0 } } };
  }

  const products = await Product.find(filter)
    .select(
      "title price image1 category stock isStockAvailable isWearable sizeStock payOnDelivery freeDelivery warranty replacementDays vendor",
    )
    .populate({ path: "vendor", select: "shopName name" })
    .limit(limit)
    .lean<SearchProductsLean[]>();

  return products.map((p) => {
    // Mongoose gắn _id tự động cho từng phần tử sizeStock; loại bỏ để khớp đúng
    // shape khai báo ở AssistantProductCard.availableSizes, không lộ ObjectId nội bộ.
    const availableSizes = (p.sizeStock ?? [])
      .filter((s) => s.stock > 0)
      .map((s) => ({ size: s.size, stock: s.stock }));
    return {
      id: String(p._id),
      title: p.title,
      price: p.price,
      image: p.image1 || null,
      category: p.category,
      shopName: p.vendor?.shopName || p.vendor?.name || "Cửa hàng MultiCart",
      inStock: true, // đã lọc ở filter, luôn true khi tới được đây
      payOnDelivery: Boolean(p.payOnDelivery),
      freeDelivery: Boolean(p.freeDelivery),
      replacementDays:
        typeof p.replacementDays === "number" && p.replacementDays > 0
          ? p.replacementDays
          : null,
      availableSizes,
      warranty: p.warranty || null,
      url: `/product/${String(p._id)}`,
    };
  });
}

export interface GetMyOrdersArgs {
  status?: string;
  limit?: number;
}

interface GetMyOrdersLean {
  _id: unknown;
  orderStatus: string;
  totalAmount: number;
  createdAt: Date;
  paymentMethod: "cod" | "vnpay";
  isPaid: boolean;
  products: { product?: { title?: string } | null }[];
  ghn?: { status?: string };
  returnRequest?: { status?: string } | null;
}

const KNOWN_ORDER_STATUSES = new Set([
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "returned",
  "delivery_exception",
  "cancelled",
]);

export async function getMyOrders(
  userId: string,
  args: GetMyOrdersArgs,
): Promise<AssistantOrderCard[]> {
  await connectDB();

  const limit = Math.max(1, Math.min(args.limit ?? 5, 10));
  const filter: Record<string, unknown> = { buyer: userId };
  if (args.status && KNOWN_ORDER_STATUSES.has(args.status)) {
    filter.orderStatus = args.status;
  }

  const orders = await Order.find(filter)
    .select("orderStatus totalAmount createdAt paymentMethod isPaid products.product ghn.status returnRequest")
    .populate({ path: "products.product", select: "title" })
    .populate({ path: "returnRequest", select: "status" })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<GetMyOrdersLean[]>();

  return orders.map((o) => ({
    id: String(o._id),
    statusLabel: getOrderStatusLabel(o.orderStatus),
    totalAmount: o.totalAmount,
    createdAt: o.createdAt.toISOString(),
    paymentMethod: o.paymentMethod,
    isPaid: o.isPaid,
    productTitles: o.products
      .map((line) => line.product?.title)
      .filter((title): title is string => Boolean(title)),
    ghnStatus: o.ghn?.status ?? null,
    returnStatus: o.returnRequest?.status ?? null,
  }));
}
