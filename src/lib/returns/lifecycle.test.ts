// Test tích hợp cho lifecycle hoàn trả (DB thật in-memory).
//
// Ba nhóm bất biến được canh ở đây, vì sai thì mất tiền hoặc sai kho:
//  1. Hoàn kho ĐÚNG MỘT LẦN, và chỉ khi hàng còn bán được.
//  2. Chốt đơn "returned" idempotent, số tiền hoàn lấy theo công thức.
//  3. Voucher: đơn returned không được kẹt reserved, cũng không được "hồi sinh"
//     voucher đã tiêu của đơn từng giao thành công.

import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import CheckoutBatch from "@/model/checkoutBatch.model";
import Order from "@/model/order.model";
import Product from "@/model/product.model";
import User from "@/model/user.model";
import UserVoucher from "@/model/userVoucher.model";
import Voucher from "@/model/voucher.model";

type ReturnsLifecycle = typeof import("./lifecycle");

type GlobalWithMongoose = typeof globalThis & {
  mongoose?: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  };
};

const VENDOR_ID = new mongoose.Types.ObjectId();
const BUYER_ID = new mongoose.Types.ObjectId();

let replset: MongoMemoryReplSet;
let restoreOrderStockOnce: ReturnsLifecycle["restoreOrderStockOnce"];
let finalizeReturnedOrder: ReturnsLifecycle["finalizeReturnedOrder"];

// Các model export theo kiểu `mongoose.models?.X || mongoose.model<IX>(...)` nên phía
// TS chúng gần như không mang kiểu — generic ở đây chỉ tổ suy ra `never`. Ràng kiểu
// thật phải sửa ở tầng model (ngoài phạm vi), nên helper test nhận any và chỉ làm đúng
// một việc: chặn null để lỗi hiện ra tại chỗ thay vì "cannot read property of null".
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function must(value: any, message = "expected a value"): any {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

async function seedProduct(
  stock: number,
  sizeStock?: { size: string; stock: number }[],
) {
  return Product.create({
    title: "Product",
    description: "desc",
    price: 100_000,
    stock,
    isStockAvailable: true,
    vendor: VENDOR_ID,
    image1: "a",
    image2: "b",
    image3: "c",
    image4: "d",
    category: "eco",
    isWearable: !!sizeStock,
    ...(sizeStock ? { sizeStock } : {}),
  });
}

async function seedOrder(opts: {
  productId: mongoose.Types.ObjectId;
  quantity?: number;
  size?: string;
  isPaid?: boolean;
  orderStatus?: string;
  deliveryDate?: Date | null;
  checkoutBatchId?: string;
  appliedVouchers?: {
    voucher: mongoose.Types.ObjectId;
    code: string;
    slot: string;
    discountType: string;
    amount: number;
  }[];
}) {
  return Order.create({
    buyer: BUYER_ID,
    productVendor: VENDOR_ID,
    products: [
      {
        product: opts.productId,
        quantity: opts.quantity ?? 2,
        price: 100_000,
        ...(opts.size ? { size: opts.size } : {}),
      },
    ],
    productsTotal: 200_000,
    deliveryCharge: 30_000,
    serviceCharge: 15_000,
    totalAmount: 245_000,
    paymentMethod: "cod",
    isPaid: opts.isPaid ?? false,
    orderStatus: opts.orderStatus ?? "delivered",
    address: {
      name: "Buyer",
      phone: "0900000000",
      address: "123 Street",
      city: "Ha Noi",
      pincode: "",
    },
    ...(opts.deliveryDate !== undefined
      ? { deliveryDate: opts.deliveryDate }
      : { deliveryDate: new Date() }),
    ...(opts.checkoutBatchId ? { checkoutBatchId: opts.checkoutBatchId } : {}),
    ...(opts.appliedVouchers ? { appliedVouchers: opts.appliedVouchers } : {}),
  });
}

async function seedVoucherReserved(batchId: string) {
  const voucher = await Voucher.create({
    code: `SAVE-${Math.random().toString(36).slice(2, 8)}`,
    title: "Save 20k",
    discountType: "fixed",
    discountValue: 20_000,
    minSpend: 0,
    totalQuota: 5,
    usedQuota: 1, // đã +1 lúc reserve
    perUserLimit: 1,
    scope: "all",
    startAt: new Date(Date.now() - 1000),
    endAt: new Date(Date.now() + 86_400_000),
    isActive: true,
    createdBy: BUYER_ID,
  });
  const userVoucher = await UserVoucher.create({
    user: BUYER_ID,
    voucher: voucher._id,
    status: "reserved",
    collectedAt: new Date(),
    reservedAt: new Date(),
    checkoutBatchId: batchId,
  });
  await CheckoutBatch.create({
    checkoutBatchId: batchId,
    checkoutRequestId: `req-${batchId}`,
    user: BUYER_ID,
    amount: 245_000,
    paymentMethod: "cod",
    status: "created",
  });
  return { voucher, userVoucher };
}

describe("returns/lifecycle", () => {
  beforeAll(async () => {
    replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replset.getUri();
    process.env.MONGODB_URL = uri;
    await mongoose.connect(uri);
    (globalThis as GlobalWithMongoose).mongoose = {
      conn: mongoose.connection,
      promise: Promise.resolve(mongoose.connection),
    };
    ({ restoreOrderStockOnce, finalizeReturnedOrder } = await import(
      "./lifecycle"
    ));
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await replset.stop();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all([
      User.deleteMany({}),
      Product.deleteMany({}),
      Voucher.deleteMany({}),
      UserVoucher.deleteMany({}),
      Order.deleteMany({}),
      CheckoutBatch.deleteMany({}),
    ]);
  });

  /* ─────────────────────  Hoàn kho  ───────────────────── */

  it("hoàn kho đúng 1 lần: gọi lần 2 không cộng dồn", async () => {
    const product = await seedProduct(5);
    const order = await seedOrder({ productId: product._id, quantity: 2 });

    const first = await restoreOrderStockOnce(order, {
      reason: "customer_return",
    });
    expect(first).toBe(true);
    expect(must(await Product.findById(product._id)).stock).toBe(7);

    // Retry/webhook lặp không được cộng kho lần nữa.
    const second = await restoreOrderStockOnce(order, {
      reason: "customer_return",
    });
    expect(second).toBe(false);
    expect(must(await Product.findById(product._id)).stock).toBe(7);
  });

  it("hàng hỏng: đánh dấu đã xử lý nhưng KHÔNG cộng kho", async () => {
    const product = await seedProduct(5);
    const order = await seedOrder({ productId: product._id, quantity: 2 });

    const ok = await restoreOrderStockOnce(order, {
      reason: "customer_return",
      disposition: "damaged",
    });
    expect(ok).toBe(true);
    expect(must(await Product.findById(product._id)).stock).toBe(5);

    const fresh = must(await Order.findById(order._id));
    expect(fresh.stockDisposition).toBe("damaged");
    expect(fresh.stockRestoredAt).toBeTruthy();
  });

  it("hàng có size: cộng lại đúng biến thể và tổng tồn", async () => {
    const product = await seedProduct(3, [
      { size: "M", stock: 3 },
      { size: "L", stock: 4 },
    ]);
    const order = await seedOrder({
      productId: product._id,
      quantity: 2,
      size: "M",
    });

    await restoreOrderStockOnce(order, { reason: "customer_return" });

    const fresh = must(await Product.findById(product._id));
    const sizes = fresh.sizeStock as { size: string; stock: number }[];
    expect(sizes.find((s) => s.size === "M")?.stock).toBe(5);
    expect(sizes.find((s) => s.size === "L")?.stock).toBe(4); // không đụng size khác
    expect(fresh.stock).toBe(5);
  });

  it("sản phẩm đã bị xoá: ném lỗi và KHÔNG claim, để gọi lại được", async () => {
    const product = await seedProduct(5);
    const order = await seedOrder({ productId: product._id, quantity: 2 });
    await Product.deleteOne({ _id: product._id });

    // Trước khi sửa: $inc không khớp gì, hàm vẫn báo thành công ⇒ mất kho im lặng.
    await expect(
      restoreOrderStockOnce(order, { reason: "customer_return" }),
    ).rejects.toThrow(/không còn tồn tại/);

    // Chưa claim ⇒ sửa dữ liệu xong gọi lại vẫn hoàn kho được.
    const fresh = must(await Order.findById(order._id));
    expect(fresh.stockRestoredAt).toBeFalsy();
  });

  it("size không còn trong sizeStock: ném lỗi, không cộng lệch tổng tồn", async () => {
    const product = await seedProduct(3, [{ size: "L", stock: 4 }]);
    const order = await seedOrder({
      productId: product._id,
      quantity: 2,
      size: "M", // size đã bị vendor gỡ khỏi sản phẩm
    });

    // Trước khi sửa: sizeStock không tăng nhưng tổng `stock` VẪN tăng ⇒ kho lệch.
    await expect(
      restoreOrderStockOnce(order, { reason: "customer_return" }),
    ).rejects.toThrow(/không còn size/);

    const fresh = must(await Product.findById(product._id));
    expect(fresh.stock).toBe(3); // không đụng gì
    expect(must(await Order.findById(order._id)).stockRestoredAt).toBeFalsy();
  });

  it("hàng hỏng: sản phẩm bị xoá cũng không sao (không cộng kho nên không cần đọc)", async () => {
    const product = await seedProduct(5);
    const order = await seedOrder({ productId: product._id, quantity: 2 });
    await Product.deleteOne({ _id: product._id });

    const ok = await restoreOrderStockOnce(order, {
      reason: "customer_return",
      disposition: "damaged",
    });
    expect(ok).toBe(true);
  });

  /* ────────────────  Chốt đơn returned  ──────────────── */

  it("đơn đã thanh toán: chốt returned + ghi số tiền hoàn theo công thức", async () => {
    const product = await seedProduct(5);
    const order = await seedOrder({
      productId: product._id,
      quantity: 2,
      isPaid: true,
    });

    await finalizeReturnedOrder(order, {
      source: "customer_return",
      disposition: "restock",
      refundAmount: 200_000,
    });

    const fresh = must(await Order.findById(order._id));
    expect(fresh.orderStatus).toBe("returned");
    expect(fresh.returnSource).toBe("customer_return");
    expect(fresh.returnedAt).toBeTruthy();
    // Không phải totalAmount (245k): serviceCharge không bao giờ hoàn.
    expect(fresh.returnedAmount).toBe(200_000);
    expect(fresh.refundStatus).toBe("pending");
    expect(must(await Product.findById(product._id)).stock).toBe(7);
  });

  it("hai finalize ĐỒNG THỜI (double-click): kho vẫn chỉ cộng một lần", async () => {
    const product = await seedProduct(5);
    const order = await seedOrder({
      productId: product._id,
      quantity: 2,
      isPaid: true,
    });

    // Hai request chạy song song thật — CAS trên stockRestoredAt phải để đúng một lần
    // cộng kho. Dùng hai doc riêng để mô phỏng hai handler độc lập.
    const [a, b] = await Promise.all([
      Order.findById(order._id),
      Order.findById(order._id),
    ]);
    await Promise.all([
      finalizeReturnedOrder(a, {
        source: "customer_return",
        disposition: "restock",
        refundAmount: 200_000,
      }),
      finalizeReturnedOrder(b, {
        source: "customer_return",
        disposition: "restock",
        refundAmount: 200_000,
      }),
    ]);

    // 5 + 2 = 7, KHÔNG phải 9.
    expect(must(await Product.findById(product._id)).stock).toBe(7);
  });

  it("gọi finalize 2 lần: không cộng kho 2 lần, không đổi tiền hoàn", async () => {
    const product = await seedProduct(5);
    const order = await seedOrder({
      productId: product._id,
      quantity: 2,
      isPaid: true,
    });

    await finalizeReturnedOrder(order, {
      source: "customer_return",
      refundAmount: 200_000,
    });
    await finalizeReturnedOrder(order, {
      source: "customer_return",
      refundAmount: 999_999,
    });

    const fresh = must(await Order.findById(order._id));
    expect(fresh.returnedAmount).toBe(200_000);
    expect(must(await Product.findById(product._id)).stock).toBe(7);
  });

  it("đơn CHƯA thanh toán: không đánh dấu cần hoàn tiền", async () => {
    const product = await seedProduct(5);
    const order = await seedOrder({
      productId: product._id,
      quantity: 2,
      isPaid: false,
    });

    await finalizeReturnedOrder(order, {
      source: "customer_return",
      refundAmount: 200_000,
    });

    const fresh = must(await Order.findById(order._id));
    expect(fresh.orderStatus).toBe("returned");
    expect(fresh.refundStatus).toBe("none");
    expect(fresh.returnedAmount ?? 0).toBe(0);
  });

  it("đơn đã thanh toán nhưng tiền hoàn = 0: KHÔNG vào hàng đợi hoàn tiền", async () => {
    const product = await seedProduct(5);
    const order = await seedOrder({
      productId: product._id,
      quantity: 2,
      isPaid: true,
    });

    // Lỗi người mua + phí ship hoàn nuốt hết tiền ⇒ công thức ra 0đ.
    await finalizeReturnedOrder(order, {
      source: "customer_return",
      disposition: "restock",
      refundAmount: 0,
    });

    const fresh = must(await Order.findById(order._id));
    expect(fresh.orderStatus).toBe("returned");
    // refundStatus="pending" với 0đ sẽ nằm mãi trong hàng đợi của admin.
    expect(fresh.refundStatus).toBe("none");
    expect(fresh.returnedAmount ?? 0).toBe(0);
    // Hàng vẫn phải về kho — không có tiền hoàn không có nghĩa là không nhận hàng.
    expect(must(await Product.findById(product._id)).stock).toBe(7);
  });

  /* ────────  Voucher: bug "returned chưa terminal"  ──────── */

  it("giao HỎNG rồi trả: voucher reserved được nhả về collected + giảm quota", async () => {
    const batchId = `batch-${Date.now()}-a`;
    const { voucher, userVoucher } = await seedVoucherReserved(batchId);
    const product = await seedProduct(5);
    const order = await seedOrder({
      productId: product._id,
      quantity: 2,
      orderStatus: "shipped",
      deliveryDate: null, // chưa từng giao thành công
      checkoutBatchId: batchId,
      appliedVouchers: [
        {
          voucher: voucher._id,
          code: voucher.code,
          slot: "platform",
          discountType: "fixed",
          amount: 20_000,
        },
      ],
    });

    await finalizeReturnedOrder(order, { source: "delivery_failure" });

    // Trước khi sửa: kẹt "reserved" vĩnh viễn và quota không bao giờ trả lại.
    const freshUV = must(await UserVoucher.findById(userVoucher._id));
    expect(freshUV.status).toBe("collected");
    expect(must(await Voucher.findById(voucher._id)).usedQuota).toBe(0);
    expect(
      must(await CheckoutBatch.findOne({ checkoutBatchId: batchId })).status,
    ).toBe("cancelled");
  });

  it("giao THÀNH CÔNG rồi mới trả: voucher giữ 'used', batch vẫn 'paid'", async () => {
    const batchId = `batch-${Date.now()}-b`;
    const { voucher, userVoucher } = await seedVoucherReserved(batchId);
    const product = await seedProduct(5);
    const order = await seedOrder({
      productId: product._id,
      quantity: 2,
      isPaid: true,
      orderStatus: "delivered",
      deliveryDate: new Date(),
      checkoutBatchId: batchId,
      appliedVouchers: [
        {
          voucher: voucher._id,
          code: voucher.code,
          slot: "platform",
          discountType: "fixed",
          amount: 20_000,
        },
      ],
    });

    await finalizeReturnedOrder(order, {
      source: "customer_return",
      disposition: "restock",
      refundAmount: 200_000,
    });

    // Voucher đã tiêu lúc giao thành công — trả hàng KHÔNG được hồi sinh nó.
    const freshUV = must(await UserVoucher.findById(userVoucher._id));
    expect(freshUV.status).toBe("used");
    expect(must(await Voucher.findById(voucher._id)).usedQuota).toBe(1);
    expect(
      must(await CheckoutBatch.findOne({ checkoutBatchId: batchId })).status,
    ).toBe("paid");
  });

  it("1 đơn returned KHÔNG chặn settlement của đơn delivered cùng batch", async () => {
    const batchId = `batch-${Date.now()}-c`;
    const { voucher, userVoucher } = await seedVoucherReserved(batchId);
    const product = await seedProduct(5);
    const applied = [
      {
        voucher: voucher._id,
        code: voucher.code,
        slot: "platform",
        discountType: "fixed",
        amount: 20_000,
      },
    ];

    // Đơn anh em đã giao thành công, dùng cùng voucher.
    await seedOrder({
      productId: product._id,
      quantity: 1,
      isPaid: true,
      orderStatus: "delivered",
      deliveryDate: new Date(),
      checkoutBatchId: batchId,
      appliedVouchers: applied,
    });

    const returnedOrder = await seedOrder({
      productId: product._id,
      quantity: 2,
      isPaid: true,
      orderStatus: "delivered",
      deliveryDate: new Date(),
      checkoutBatchId: batchId,
      appliedVouchers: applied,
    });

    await finalizeReturnedOrder(returnedOrder, {
      source: "customer_return",
      disposition: "restock",
      refundAmount: 200_000,
    });

    // Trước khi sửa: đơn returned "đầu độc" cả batch → voucher của đơn delivered
    // anh em cũng kẹt reserved.
    const freshUV = must(await UserVoucher.findById(userVoucher._id));
    expect(freshUV.status).toBe("used");
    expect(
      must(await CheckoutBatch.findOne({ checkoutBatchId: batchId })).status,
    ).toBe("paid");
  });

  it("rollback marker when product changes after validation", async () => {
    const product = await seedProduct(5);
    const order = await seedOrder({ productId: product._id, quantity: 2 });

    vi.spyOn(Product, "updateOne").mockResolvedValueOnce({
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 0,
      upsertedId: null,
    });

    await expect(
      restoreOrderStockOnce(order, { reason: "customer_return" }),
    ).rejects.toThrow();

    expect(must(await Order.findById(order._id)).stockRestoredAt).toBeFalsy();
    expect(must(await Product.findById(product._id)).stock).toBe(5);
  });
});
