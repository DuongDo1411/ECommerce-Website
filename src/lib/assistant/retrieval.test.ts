import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";

import Product from "@/model/product.model";
import User from "@/model/user.model";
import Order from "@/model/order.model";
import ReturnRequest from "@/model/returnRequest.model";

type SearchProducts = typeof import("./retrieval").searchProducts;
type GetMyOrders = typeof import("./retrieval").getMyOrders;

type GlobalWithMongoose = typeof globalThis & {
  mongoose?: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  };
};

let replset: MongoMemoryReplSet;
let searchProducts: SearchProducts;
let getMyOrders: GetMyOrders;

const VENDOR_ID = new mongoose.Types.ObjectId();

function baseProduct(overrides: Partial<InstanceType<typeof Product>> = {}) {
  return {
    title: "Áo thun cotton",
    description: "desc",
    price: 150_000,
    stock: 10,
    isStockAvailable: true,
    vendor: VENDOR_ID,
    image1: "img1",
    image2: "img2",
    image3: "img3",
    image4: "img4",
    category: "Thời trang",
    isWearable: false,
    verificationStatus: "approved",
    isActive: true,
    ...overrides,
  };
}

describe("assistant retrieval (data scoping)", () => {
  beforeAll(async () => {
    replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replset.getUri();
    process.env.MONGODB_URL = uri;
    await mongoose.connect(uri);
    (globalThis as GlobalWithMongoose).mongoose = {
      conn: mongoose.connection,
      promise: Promise.resolve(mongoose.connection),
    };
    ({ searchProducts, getMyOrders } = await import("./retrieval"));
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await replset.stop();
  });

  afterEach(async () => {
    await Promise.all([
      Product.deleteMany({}),
      User.deleteMany({}),
      Order.deleteMany({}),
      ReturnRequest.deleteMany({}),
    ]);
  });

  describe("searchProducts", () => {
    it("chỉ trả sản phẩm isActive:true và verificationStatus:approved", async () => {
      await Product.create(baseProduct({ title: "Áo thun cotton xanh" }));
      await Product.create(
        baseProduct({ title: "Áo thun cotton pending", verificationStatus: "pending" }),
      );
      await Product.create(
        baseProduct({ title: "Áo thun cotton inactive", isActive: false }),
      );
      await Product.create(
        baseProduct({ title: "Áo thun cotton rejected", verificationStatus: "rejected" }),
      );

      const results = await searchProducts({ keywords: "cotton" });

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Áo thun cotton xanh");
    });

    it("lọc đúng theo khoảng giá, size và payOnDelivery", async () => {
      await Product.create(
        baseProduct({
          title: "Giày thể thao",
          price: 500_000,
          payOnDelivery: true,
          isWearable: true,
          sizeStock: [{ size: "42", stock: 3 }],
          category: "Giày",
        }),
      );
      await Product.create(
        baseProduct({
          title: "Giày da",
          price: 2_000_000,
          payOnDelivery: false,
          isWearable: true,
          sizeStock: [{ size: "40", stock: 2 }],
          category: "Giày",
        }),
      );

      const results = await searchProducts({
        category: "Giày",
        maxPrice: 1_000_000,
        payOnDelivery: true,
        size: "42",
      });

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Giày thể thao");
      expect(results[0].payOnDelivery).toBe(true);
    });

    it("giới hạn limit tối đa 8 dù client yêu cầu nhiều hơn", async () => {
      for (let i = 0; i < 10; i += 1) {
        await Product.create(baseProduct({ title: `Sản phẩm ${i}` }));
      }
      const results = await searchProducts({ limit: 50 });
      expect(results.length).toBeLessThanOrEqual(8);
    });

    it("không trả sản phẩm hết hàng (stock:0) hoặc isStockAvailable:false", async () => {
      await Product.create(baseProduct({ title: "Còn hàng", stock: 5, isStockAvailable: true }));
      await Product.create(baseProduct({ title: "Hết hàng theo stock", stock: 0 }));
      await Product.create(
        baseProduct({ title: "Bị tắt tồn kho", stock: 5, isStockAvailable: false }),
      );

      const results = await searchProducts({});

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Còn hàng");
    });

    it("size được yêu cầu phải chính size đó có stock dương, không suy từ tổng stock", async () => {
      await Product.create(
        baseProduct({
          title: "Áo nhiều size",
          isWearable: true,
          stock: 3, // tổng vẫn dương nhờ size khác, nhưng size "M" bằng 0
          sizeStock: [
            { size: "M", stock: 0 },
            { size: "L", stock: 3 },
          ],
        }),
      );

      const results = await searchProducts({ size: "M" });

      expect(results).toHaveLength(0);
    });

    it("availableSizes chỉ liệt kê size còn hàng, không lộ size đã hết", async () => {
      await Product.create(
        baseProduct({
          title: "Áo nhiều size",
          isWearable: true,
          stock: 3,
          sizeStock: [
            { size: "M", stock: 0 },
            { size: "L", stock: 3 },
          ],
        }),
      );

      const results = await searchProducts({ keywords: "Áo nhiều size" });

      expect(results[0].availableSizes).toEqual([{ size: "L", stock: 3 }]);
    });

    it("trả đúng warranty của sản phẩm", async () => {
      await Product.create(baseProduct({ title: "Có bảo hành", warranty: "12 tháng" }));

      const results = await searchProducts({ keywords: "Có bảo hành" });

      expect(results[0].warranty).toBe("12 tháng");
    });
  });

  describe("getMyOrders", () => {
    it("chỉ trả đơn của đúng userId, không rò đơn của buyer khác", async () => {
      const buyerA = await User.create({ name: "Buyer A", email: "a@example.com", role: "user" });
      const buyerB = await User.create({ name: "Buyer B", email: "b@example.com", role: "user" });
      const product = await Product.create(baseProduct());

      const orderLine = { product: product._id, quantity: 1, price: product.price };
      const baseAddress = {
        name: "Buyer",
        phone: "0900000000",
        address: "123 Street",
        city: "Ha Noi",
      };

      await Order.create({
        products: [orderLine],
        buyer: buyerA._id,
        productVendor: VENDOR_ID,
        productsTotal: product.price,
        totalAmount: product.price,
        paymentMethod: "cod",
        orderStatus: "pending",
        address: baseAddress,
      });
      await Order.create({
        products: [orderLine],
        buyer: buyerB._id,
        productVendor: VENDOR_ID,
        productsTotal: product.price,
        totalAmount: product.price,
        paymentMethod: "cod",
        orderStatus: "pending",
        address: baseAddress,
      });

      const ordersForA = await getMyOrders(buyerA._id.toString(), {});

      expect(ordersForA).toHaveLength(1);
      expect(ordersForA[0].totalAmount).toBe(product.price);
    });

    it("dịch orderStatus sang đúng nhãn buyer-facing", async () => {
      const buyer = await User.create({ name: "Buyer", email: "c@example.com", role: "user" });
      const product = await Product.create(baseProduct());
      await Order.create({
        products: [{ product: product._id, quantity: 1, price: product.price }],
        buyer: buyer._id,
        productVendor: VENDOR_ID,
        productsTotal: product.price,
        totalAmount: product.price,
        paymentMethod: "vnpay",
        orderStatus: "shipped",
        address: {
          name: "Buyer",
          phone: "0900000000",
          address: "123 Street",
          city: "Ha Noi",
        },
      });

      const orders = await getMyOrders(buyer._id.toString(), {});

      expect(orders[0].statusLabel).toBe("Đang vận chuyển");
    });

    it("tra đơn có returnRequest không phát sinh MissingSchemaError, và không có cũng chạy được", async () => {
      const buyer = await User.create({ name: "Buyer", email: "d@example.com", role: "user" });
      const product = await Product.create(baseProduct());
      const orderNoReturn = await Order.create({
        products: [{ product: product._id, quantity: 1, price: product.price }],
        buyer: buyer._id,
        productVendor: VENDOR_ID,
        productsTotal: product.price,
        totalAmount: product.price,
        paymentMethod: "cod",
        orderStatus: "delivered",
        address: { name: "Buyer", phone: "0900000000", address: "123 Street", city: "Ha Noi" },
      });

      const orderWithReturn = await Order.create({
        products: [{ product: product._id, quantity: 1, price: product.price }],
        buyer: buyer._id,
        productVendor: VENDOR_ID,
        productsTotal: product.price,
        totalAmount: product.price,
        paymentMethod: "cod",
        orderStatus: "delivered",
        address: { name: "Buyer", phone: "0900000000", address: "123 Street", city: "Ha Noi" },
      });
      const returnDoc = await ReturnRequest.create({
        order: orderWithReturn._id,
        buyer: buyer._id,
        vendor: VENDOR_ID,
        caseType: "customer_return",
        status: "requested",
        reasonCode: "damaged",
        evidence: [],
        requestedAt: new Date(),
        history: [],
      });
      orderWithReturn.returnRequest = returnDoc._id;
      await orderWithReturn.save();

      await expect(getMyOrders(buyer._id.toString(), {})).resolves.not.toThrow();
      const orders = await getMyOrders(buyer._id.toString(), {});

      const withReturn = orders.find((o) => o.id === String(orderWithReturn._id));
      const withoutReturn = orders.find((o) => o.id === String(orderNoReturn._id));
      expect(withReturn?.returnStatus).toBe("requested");
      expect(withoutReturn?.returnStatus).toBeNull();
    });
  });
});
