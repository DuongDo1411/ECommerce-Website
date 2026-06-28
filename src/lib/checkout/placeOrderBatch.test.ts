import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";

// GHN gọi mạng ngoài -> mock để quote tính phí cố định, deterministic.
const mocks = vi.hoisted(() => ({ computeFeesByVendor: vi.fn() }));
vi.mock("@/lib/ghn", () => ({ computeFeesByVendor: mocks.computeFeesByVendor }));

import Product from "@/model/product.model";
import User from "@/model/user.model";
import Voucher from "@/model/voucher.model";
import UserVoucher from "@/model/userVoucher.model";
import Order from "@/model/order.model";
import CheckoutBatch from "@/model/checkoutBatch.model";
import { releaseBatchIfFullyCancelled } from "@/lib/voucher/lifecycle";

type PlaceOrderBatch = typeof import("./placeOrderBatch").placeOrderBatch;
type ComputeOrderQuote = typeof import("@/lib/voucher/quote").computeOrderQuote;

type GlobalWithMongoose = typeof globalThis & {
  mongoose?: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  };
};

const VENDOR_ID = new mongoose.Types.ObjectId();
const FEE = 30_000;
const SERVICE_CHARGE = 15_000;

let replset: MongoMemoryReplSet;
let placeOrderBatch: PlaceOrderBatch;
let computeOrderQuote: ComputeOrderQuote;

function must<T>(value: T | null | undefined, message = "expected a value"): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

let emailSeq = 0;
async function seedBuyer(qty: number, productId: mongoose.Types.ObjectId) {
  emailSeq += 1;
  const user = await User.create({
    name: "Buyer",
    email: `buyer-${emailSeq}-${Date.now()}@example.com`,
    role: "user",
    addresses: [
      {
        fullName: "Buyer",
        phone: "0900000000",
        provinceId: 1,
        provinceName: "Ha Noi",
        districtId: 1,
        districtName: "District",
        wardCode: "W1",
        wardName: "Ward",
        addressDetail: "123 Street",
        isDefault: true,
      },
    ],
    cart: [{ product: productId, quantity: qty }],
    orders: [],
  });
  const addressId = must(must(user.addresses)[0]._id).toString();
  return { user, addressId };
}

async function seedProduct(stock: number, price = 100_000) {
  return Product.create({
    title: "Product",
    description: "desc",
    price,
    stock,
    isStockAvailable: true,
    vendor: VENDOR_ID,
    image1: "a",
    image2: "b",
    image3: "c",
    image4: "d",
    category: "eco",
    isWearable: false,
  });
}

describe("placeOrderBatch (transaction safety)", () => {
beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replset.getUri();
  process.env.MONGODB_URL = uri;
  await mongoose.connect(uri);
  // connectDB() đọc cache này nên sẽ tái dùng kết nối in-memory thay vì Atlas.
  (globalThis as GlobalWithMongoose).mongoose = {
    conn: mongoose.connection,
    promise: Promise.resolve(mongoose.connection),
  };
  ({ placeOrderBatch } = await import("./placeOrderBatch"));
  ({ computeOrderQuote } = await import("@/lib/voucher/quote"));
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await replset.stop();
});

beforeEach(() => {
  mocks.computeFeesByVendor.mockResolvedValue({
    feesByVendor: [
      { vendorId: VENDOR_ID.toString(), fee: FEE, serviceId: 53320, isFreeDelivery: false },
    ],
    totalFee: FEE,
  });
});

afterEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Product.deleteMany({}),
    Voucher.deleteMany({}),
    UserVoucher.deleteMany({}),
    Order.deleteMany({}),
    CheckoutBatch.deleteMany({}),
  ]);
  vi.clearAllMocks();
});

async function quoteTotal(
  userId: string,
  addressId: string,
  productId: string,
  qty: number,
  selection: {
    shopVoucherCodes?: string[];
    platformVoucherCode?: string;
    freeshipVoucherCode?: string;
  } = {},
) {
  const quote = await computeOrderQuote({
    userId,
    addressId,
    items: [{ productId, quantity: qty }],
    ...selection,
  });
  return quote.finalPayable;
}

  it("COD success: tạo order, trừ stock, dọn cart, push user.orders", async () => {
    const product = await seedProduct(10);
    const productId = product._id.toString();
    const { user, addressId } = await seedBuyer(2, product._id);
    const userId = user._id.toString();
    const clientTotal = await quoteTotal(userId, addressId, productId, 2);

    const result = await placeOrderBatch({
      userId,
      items: [{ productId, quantity: 2 }],
      addressId,
      clientTotal,
      paymentMethod: "cod",
      voucherSelection: {},
      checkoutRequestId: "cod-1",
    });

    expect(result.reused).toBe(false);
    expect(result.orderIds).toHaveLength(1);
    expect(clientTotal).toBe(100_000 * 2 + FEE + SERVICE_CHARGE);

    const orders = await Order.find({ checkoutBatchId: result.checkoutBatchId });
    expect(orders).toHaveLength(1);
    expect(orders[0].paymentMethod).toBe("cod");
    expect(orders[0].isPaid).toBe(false);

    const freshProduct = must(await Product.findById(product._id));
    expect(freshProduct.stock).toBe(8);

    const freshUser = must(await User.findById(user._id));
    expect(freshUser.cart ?? []).toHaveLength(0);
    expect((freshUser.orders ?? []).map(String)).toContain(result.orderIds[0]);

    const batch = must(await CheckoutBatch.findOne({ checkoutBatchId: result.checkoutBatchId }));
    expect(batch.status).toBe("created");
  });

  it("VNPay success: lưu txnRef trên order + voucher reserved có txnRef, usedQuota +1", async () => {
    const product = await seedProduct(10);
    const productId = product._id.toString();
    const { user, addressId } = await seedBuyer(1, product._id);
    const userId = user._id.toString();

    const voucher = await Voucher.create({
      code: "SAVE20",
      title: "Save 20k",
      discountType: "fixed",
      discountValue: 20_000,
      minSpend: 0,
      totalQuota: 5,
      usedQuota: 0,
      perUserLimit: 1,
      scope: "all",
      startAt: new Date(Date.now() - 1000),
      endAt: new Date(Date.now() + 86_400_000),
      isActive: true,
      createdBy: user._id,
    });
    await UserVoucher.create({
      user: user._id,
      voucher: voucher._id,
      status: "collected",
      collectedAt: new Date(),
    });

    const selection = { platformVoucherCode: "SAVE20" };
    const clientTotal = await quoteTotal(userId, addressId, productId, 1, selection);

    const result = await placeOrderBatch({
      userId,
      items: [{ productId, quantity: 1 }],
      addressId,
      clientTotal,
      paymentMethod: "vnpay",
      voucherSelection: selection,
      checkoutRequestId: "vnpay-1",
    });

    expect(result.txnRef).toBeTruthy();
    const order = must(await Order.findById(result.orderIds[0]));
    expect(order.paymentDetails?.vnpayTxnRef).toBe(result.txnRef);

    const freshVoucher = must(await Voucher.findById(voucher._id));
    expect(freshVoucher.usedQuota).toBe(1);

    const userVoucher = must(await UserVoucher.findOne({ user: user._id, voucher: voucher._id }));
    expect(userVoucher.status).toBe("reserved");
    expect(userVoucher.txnRef).toBe(result.txnRef);
    expect(userVoucher.checkoutBatchId).toBe(result.checkoutBatchId);
  });

  it("Voucher hết quota: không tạo order, không trừ stock, usedQuota giữ nguyên", async () => {
    const product = await seedProduct(10);
    const productId = product._id.toString();
    const { user, addressId } = await seedBuyer(1, product._id);
    const userId = user._id.toString();

    const voucher = await Voucher.create({
      code: "FULL",
      title: "Full",
      discountType: "fixed",
      discountValue: 10_000,
      minSpend: 0,
      totalQuota: 1,
      usedQuota: 1,
      perUserLimit: 1,
      scope: "all",
      startAt: new Date(Date.now() - 1000),
      endAt: new Date(Date.now() + 86_400_000),
      isActive: true,
      createdBy: user._id,
    });
    await UserVoucher.create({
      user: user._id,
      voucher: voucher._id,
      status: "collected",
      collectedAt: new Date(),
    });

    await expect(
      placeOrderBatch({
        userId,
        items: [{ productId, quantity: 1 }],
        addressId,
        clientTotal: 999_999,
        paymentMethod: "cod",
        voucherSelection: { platformVoucherCode: "FULL" },
        checkoutRequestId: "full-1",
      }),
    ).rejects.toThrow();

    expect(await Order.countDocuments({})).toBe(0);
    expect(must(await Product.findById(product._id)).stock).toBe(10);
    expect(must(await Voucher.findById(voucher._id)).usedQuota).toBe(1);
  });

  it("Stock không đủ: không tạo order, không tạo batch", async () => {
    const product = await seedProduct(1);
    const productId = product._id.toString();
    const { user, addressId } = await seedBuyer(5, product._id);
    const userId = user._id.toString();

    await expect(
      placeOrderBatch({
        userId,
        items: [{ productId, quantity: 5 }],
        addressId,
        clientTotal: 999_999,
        paymentMethod: "cod",
        voucherSelection: {},
        checkoutRequestId: "stock-1",
      }),
    ).rejects.toThrow();

    expect(await Order.countDocuments({})).toBe(0);
    expect(await CheckoutBatch.countDocuments({})).toBe(0);
    expect(must(await Product.findById(product._id)).stock).toBe(1);
  });

  it("Quantity request khác cart: reject trước khi tạo batch/order", async () => {
    const product = await seedProduct(10);
    const productId = product._id.toString();
    const { user, addressId } = await seedBuyer(1, product._id);
    const userId = user._id.toString();

    await expect(
      placeOrderBatch({
        userId,
        items: [{ productId, quantity: 2 }],
        addressId,
        clientTotal: 999_999,
        paymentMethod: "cod",
        voucherSelection: {},
        checkoutRequestId: "qty-mismatch",
      }),
    ).rejects.toThrow();

    expect(await Order.countDocuments({})).toBe(0);
    expect(await CheckoutBatch.countDocuments({})).toBe(0);
    expect(must(await Product.findById(product._id)).stock).toBe(10);
  });

  it("Batch đã đóng không được reuse bằng checkoutRequestId cũ", async () => {
    const product = await seedProduct(10);
    const productId = product._id.toString();
    const { user, addressId } = await seedBuyer(1, product._id);
    const userId = user._id.toString();
    const clientTotal = await quoteTotal(userId, addressId, productId, 1);

    const first = await placeOrderBatch({
      userId,
      items: [{ productId, quantity: 1 }],
      addressId,
      clientTotal,
      paymentMethod: "cod",
      voucherSelection: {},
      checkoutRequestId: "closed-1",
    });

    await Order.updateMany(
      { checkoutBatchId: first.checkoutBatchId },
      { $set: { orderStatus: "cancelled", cancelledAt: new Date() } },
    );
    await releaseBatchIfFullyCancelled(first.checkoutBatchId);

    await expect(
      placeOrderBatch({
        userId,
        items: [{ productId, quantity: 1 }],
        addressId,
        clientTotal,
        paymentMethod: "cod",
        voucherSelection: {},
        checkoutRequestId: "closed-1",
      }),
    ).rejects.toMatchObject({ code: "checkout_closed" });

    expect(await Order.countDocuments({})).toBe(1);
    expect(must(await CheckoutBatch.findOne({ checkoutBatchId: first.checkoutBatchId })).status).toBe("cancelled");
  });

  it("Sản phẩm có size nhưng stock tổng lệch thấp: không trừ stock âm", async () => {
    const product = await Product.create({
      title: "Wearable",
      description: "desc",
      price: 100_000,
      stock: 0,
      isStockAvailable: true,
      vendor: VENDOR_ID,
      image1: "a",
      image2: "b",
      image3: "c",
      image4: "d",
      category: "eco",
      isWearable: true,
      size: ["M"],
      sizeStock: [{ size: "M", stock: 5 }],
    });
    const user = await User.create({
      name: "Buyer",
      email: `buyer-size-${Date.now()}@example.com`,
      role: "user",
      addresses: [
        {
          fullName: "Buyer",
          phone: "0900000000",
          provinceId: 1,
          provinceName: "Ha Noi",
          districtId: 1,
          districtName: "District",
          wardCode: "W1",
          wardName: "Ward",
          addressDetail: "123 Street",
          isDefault: true,
        },
      ],
      cart: [{ product: product._id, quantity: 1, size: "M" }],
      orders: [],
    });
    const addressId = must(must(user.addresses)[0]._id).toString();
    const quote = await computeOrderQuote({
      userId: user._id.toString(),
      addressId,
      items: [{ productId: product._id.toString(), quantity: 1, size: "M" }],
    });
    const clientTotal = quote.finalPayable;

    await expect(
      placeOrderBatch({
        userId: user._id.toString(),
        items: [{ productId: product._id.toString(), quantity: 1, size: "M" }],
        addressId,
        clientTotal,
        paymentMethod: "cod",
        voucherSelection: {},
        checkoutRequestId: "size-stock-total",
      }),
    ).rejects.toMatchObject({ code: "insufficient_stock" });

    const freshProduct = must(await Product.findById(product._id));
    expect(freshProduct.stock).toBe(0);
    expect(freshProduct.sizeStock?.[0]?.stock).toBe(5);
    expect(await Order.countDocuments({})).toBe(0);
  });

  it("Double submit cùng checkoutRequestId: trả batch cũ, không tạo đơn trùng", async () => {
    const product = await seedProduct(10);
    const productId = product._id.toString();
    const { user, addressId } = await seedBuyer(2, product._id);
    const userId = user._id.toString();
    const clientTotal = await quoteTotal(userId, addressId, productId, 2);

    const first = await placeOrderBatch({
      userId,
      items: [{ productId, quantity: 2 }],
      addressId,
      clientTotal,
      paymentMethod: "cod",
      voucherSelection: {},
      checkoutRequestId: "dup-1",
    });

    // Lần 2: cùng key. Cart đã bị dọn nhưng idempotency phải trả batch cũ.
    const second = await placeOrderBatch({
      userId,
      items: [{ productId, quantity: 2 }],
      addressId,
      clientTotal,
      paymentMethod: "cod",
      voucherSelection: {},
      checkoutRequestId: "dup-1",
    });

    expect(second.reused).toBe(true);
    expect(second.checkoutBatchId).toBe(first.checkoutBatchId);
    expect(second.orderIds).toEqual(first.orderIds);
    expect(await Order.countDocuments({})).toBe(1);
    expect(must(await Product.findById(product._id)).stock).toBe(8);
  });

  it("Đồng thời stock=1: chỉ một request thành công, stock không âm, đơn còn lại rollback", async () => {
    const product = await seedProduct(1);
    const productId = product._id.toString();
    const a = await seedBuyer(1, product._id);
    const b = await seedBuyer(1, product._id);
    const clientTotal = 100_000 + FEE + SERVICE_CHARGE;

    const results = await Promise.allSettled([
      placeOrderBatch({
        userId: a.user._id.toString(),
        items: [{ productId, quantity: 1 }],
        addressId: a.addressId,
        clientTotal,
        paymentMethod: "cod",
        voucherSelection: {},
        checkoutRequestId: "race-a",
      }),
      placeOrderBatch({
        userId: b.user._id.toString(),
        items: [{ productId, quantity: 1 }],
        addressId: b.addressId,
        clientTotal,
        paymentMethod: "cod",
        voucherSelection: {},
        checkoutRequestId: "race-b",
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    expect(must(await Product.findById(product._id)).stock).toBe(0);
    expect(await Order.countDocuments({})).toBe(1);
  });
});
