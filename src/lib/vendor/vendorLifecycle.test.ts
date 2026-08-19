// Vòng đời nhà bán: draft -> pending -> approved | rejected, cùng hai bất biến quan trọng nhất.
//
//   1. Chưa được duyệt thì KHÔNG phát sinh giao dịch bán mới, nhưng VẪN hoàn thiện được hồ sơ.
//   2. Nhà bán rời khỏi trạng thái approved thì sản phẩm của họ lập tức mất khỏi bề mặt công
//      khai và không đặt hàng được, mà không phải sửa một document sản phẩm nào.

import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const authState: { value: unknown } = { value: null };
vi.mock("@/auth", () => ({ auth: () => Promise.resolve(authState.value) }));

import Product from "@/model/product.model";
import User from "@/model/user.model";

type GlobalWithMongoose = typeof globalThis & {
  mongoose?: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  };
};

let replset: MongoMemoryReplSet;
let addProductPOST: typeof import("@/app/api/vendor/addProduct/route").POST;
let editDetailsPOST: typeof import("@/app/api/vendor/editDetails/route").POST;
let updateVendorPOST: typeof import("@/app/api/admin/update_vendor_status/route").POST;
let updateProductPOST: typeof import("@/app/api/admin/update_product_status/route").POST;
let adminVendorsGET: typeof import("@/app/api/admin/vendors/route").GET;
let publicProductsGET: typeof import("@/app/api/user/products/route").GET;
let cartPOST: typeof import("@/app/api/user/cart/route").POST;

const VENDOR_ID = new mongoose.Types.ObjectId();
const ADMIN_ID = new mongoose.Types.ObjectId();
const BUYER_ID = new mongoose.Types.ObjectId();

const GOOD_PROFILE = {
  phone: "0901234567",
  shopName: "Shop Xanh",
  taxNumber: "0101234567",
  shopAddressDetail: {
    address: "1 Duong A",
    wardCode: "W1",
    wardName: "Phuong B",
    districtId: 1,
    districtName: "Quan C",
    provinceId: 2,
    provinceName: "Tinh D",
  },
};

const FULL_ADDRESS = "1 Duong A, Phuong B, Quan C, Tinh D";

const post = (body: unknown) =>
  new NextRequest("http://localhost/", {
    method: "POST",
    body: JSON.stringify(body),
  });

function actAs(id: mongoose.Types.ObjectId, role: string) {
  authState.value = { user: { id: id.toString(), role } };
}

async function seedVendor(overrides: Record<string, unknown> = {}) {
  return User.create({
    _id: VENDOR_ID,
    name: "Vendor",
    email: "vendor@example.com",
    emailNormalized: "vendor@example.com",
    role: "vendor",
    verificationStatus: "draft",
    isApproved: false,
    ...overrides,
  });
}

async function seedApprovedVendor() {
  return seedVendor({
    ...GOOD_PROFILE,
    shopAddress: FULL_ADDRESS,
    verificationStatus: "approved",
    isApproved: true,
  });
}

async function seedProduct() {
  return Product.create({
    title: "Ao thun",
    description: "desc",
    price: 100_000,
    stock: 10,
    isStockAvailable: true,
    vendor: VENDOR_ID,
    verificationStatus: "approved",
    isActive: true,
    image1: "a",
    image2: "b",
    image3: "c",
    image4: "d",
    category: "eco",
    isWearable: false,
  });
}

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replset.getUri();
  process.env.MONGODB_URL = uri;
  await mongoose.connect(uri);
  (globalThis as GlobalWithMongoose).mongoose = {
    conn: mongoose.connection,
    promise: Promise.resolve(mongoose.connection),
  };
  await User.init();
  await Product.init();

  addProductPOST = (await import("@/app/api/vendor/addProduct/route")).POST;
  editDetailsPOST = (await import("@/app/api/vendor/editDetails/route")).POST;
  updateVendorPOST = (
    await import("@/app/api/admin/update_vendor_status/route")
  ).POST;
  updateProductPOST = (
    await import("@/app/api/admin/update_product_status/route")
  ).POST;
  adminVendorsGET = (await import("@/app/api/admin/vendors/route")).GET;
  publicProductsGET = (await import("@/app/api/user/products/route")).GET;
  cartPOST = (await import("@/app/api/user/cart/route")).POST;
}, 120_000);

beforeEach(async () => {
  await User.create({
    _id: ADMIN_ID,
    name: "Admin",
    email: "admin@example.com",
    emailNormalized: "admin@example.com",
    role: "admin",
  });
  await User.create({
    _id: BUYER_ID,
    name: "Buyer",
    email: "buyer@example.com",
    emailNormalized: "buyer@example.com",
    role: "user",
  });
});

afterEach(async () => {
  authState.value = null;
  await Promise.all([User.deleteMany({}), Product.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await replset.stop();
});

describe("nhà bán chưa duyệt không bán được nhưng vẫn khai được hồ sơ", () => {
  it("chặn thêm sản phẩm ở draft, pending và rejected", async () => {
    for (const verificationStatus of ["draft", "pending", "rejected"]) {
      await User.deleteOne({ _id: VENDOR_ID });
      await seedVendor({ verificationStatus });
      actAs(VENDOR_ID, "vendor");

      const res = await addProductPOST(post({ title: "X" }));
      expect(res.status, verificationStatus).toBe(403);
      expect((await res.json()).code).toBe("vendor_not_approved");
    }
  });

  it("nhà bán ở draft vẫn gửi được hồ sơ và chuyển sang pending", async () => {
    await seedVendor();
    actAs(VENDOR_ID, "vendor");

    const res = await editDetailsPOST(post(GOOD_PROFILE));
    expect(res.status).toBe(200);

    const vendor = await User.findById(VENDOR_ID);
    expect(vendor!.verificationStatus).toBe("pending");
    expect(vendor!.isApproved).toBe(false);
    expect(vendor!.requestedAt).toBeTruthy();
    expect(vendor!.phone).toBe("0901234567");
    // Server tự dựng chuỗi địa chỉ từ dữ liệu đã kiểm, không nhận chuỗi của client.
    expect(vendor!.shopAddress).toBe(FULL_ADDRESS);
  });

  it("nhà bán bị từ chối gửi lại được, và lý do từ chối cũ bị xoá", async () => {
    await seedVendor({
      verificationStatus: "rejected",
      rejectedReason: "Thieu giay to",
    });
    actAs(VENDOR_ID, "vendor");

    expect((await editDetailsPOST(post(GOOD_PROFILE))).status).toBe(200);

    const vendor = await User.findById(VENDOR_ID);
    expect(vendor!.verificationStatus).toBe("pending");
    expect(vendor!.rejectedReason).toBeUndefined();
  });

  it("từ chối hồ sơ có số điện thoại sai định dạng", async () => {
    await seedVendor();
    actAs(VENDOR_ID, "vendor");

    const res = await editDetailsPOST(
      post({ ...GOOD_PROFILE, phone: "12345" }),
    );
    expect(res.status).toBe(400);

    const vendor = await User.findById(VENDOR_ID);
    expect(vendor!.verificationStatus).toBe("draft");
  });

  it("đang pending với hồ sơ đầy đủ thì không gửi lại được", async () => {
    await seedVendor({
      ...GOOD_PROFILE,
      shopAddress: FULL_ADDRESS,
      verificationStatus: "pending",
    });
    actAs(VENDOR_ID, "vendor");

    const res = await editDetailsPOST(post(GOOD_PROFILE));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("invalid_vendor_transition");
  });

  it("nhà bán cũ mang pending nhưng thiếu hồ sơ vẫn gửi được", async () => {
    // Giá trị mặc định của schema là "pending", nên tài khoản cũ chưa từng khai gì vẫn ở trạng
    // thái đó. Chặn cứng theo trạng thái sẽ khoá họ ngoài form khai hồ sơ.
    await seedVendor({ verificationStatus: "pending" });
    actAs(VENDOR_ID, "vendor");

    expect((await editDetailsPOST(post(GOOD_PROFILE))).status).toBe(200);
  });

  it("nhà bán đã duyệt sửa hồ sơ thì quay lại pending và ngừng bán", async () => {
    await seedApprovedVendor();
    actAs(VENDOR_ID, "vendor");

    expect((await editDetailsPOST(post(GOOD_PROFILE))).status).toBe(200);

    const vendor = await User.findById(VENDOR_ID);
    expect(vendor!.verificationStatus).toBe("pending");
    expect(vendor!.isApproved).toBe(false);

    // Và từ lúc này họ không thêm được sản phẩm nữa.
    expect((await addProductPOST(post({ title: "X" }))).status).toBe(403);
  });
});

describe("sản phẩm biến mất khỏi bề mặt công khai khi nhà bán rời trạng thái approved", () => {
  it("danh sách công khai chỉ có sản phẩm của nhà bán đang được duyệt", async () => {
    await seedApprovedVendor();
    const product = await seedProduct();

    const before = await (await publicProductsGET()).json();
    expect(before).toHaveLength(1);

    // Đổi đúng một document — của NHÀ BÁN, không chạm sản phẩm.
    await User.updateOne(
      { _id: VENDOR_ID },
      { $set: { verificationStatus: "pending", isApproved: false } },
    );

    const after = await (await publicProductsGET()).json();
    expect(after).toHaveLength(0);

    // Sản phẩm vẫn nguyên trạng, chỉ là không còn được bán.
    const fresh = await Product.findById(product._id);
    expect(fresh!.verificationStatus).toBe("approved");
    expect(fresh!.isActive).toBe(true);
  });

  it("không thêm được vào giỏ khi cửa hàng tạm ngưng", async () => {
    await seedVendor({ verificationStatus: "pending" });
    const product = await seedProduct();
    actAs(BUYER_ID, "user");

    const res = await cartPOST(
      post({ productId: product._id.toString(), quantity: 1 }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("vendor_not_sellable");
  });

  it("quản trị viên không duyệt được sản phẩm của nhà bán chưa duyệt", async () => {
    await seedVendor({ verificationStatus: "pending" });
    const product = await Product.create({
      title: "Cho duyet",
      description: "desc",
      price: 1000,
      stock: 1,
      vendor: VENDOR_ID,
      image1: "a",
      image2: "b",
      image3: "c",
      image4: "d",
      category: "eco",
    });
    actAs(ADMIN_ID, "admin");

    const res = await updateProductPOST(
      post({ productId: product._id.toString(), status: "approved" }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("vendor_not_sellable");

    const fresh = await Product.findById(product._id);
    expect(fresh!.verificationStatus).toBe("pending");
  });
});

describe("duyệt hồ sơ nhà bán", () => {
  async function pendingVendor() {
    await seedVendor({
      ...GOOD_PROFILE,
      shopAddress: FULL_ADDRESS,
      verificationStatus: "pending",
      requestedAt: new Date(),
    });
    return (await User.findById(VENDOR_ID))!;
  }

  it("duyệt thành công khi thẻ phiên bản còn khớp", async () => {
    const vendor = await pendingVendor();
    actAs(ADMIN_ID, "admin");

    const res = await updateVendorPOST(
      post({
        vendorId: VENDOR_ID.toString(),
        status: "approved",
        expectedUpdatedAt: vendor.updatedAt?.toISOString(),
      }),
    );
    expect(res.status).toBe(200);

    const fresh = await User.findById(VENDOR_ID);
    expect(fresh!.verificationStatus).toBe("approved");
    expect(fresh!.isApproved).toBe(true);
  });

  it("trả 409 khi hồ sơ đã đổi sau lúc quản trị viên mở", async () => {
    const vendor = await pendingVendor();
    const stale = vendor.updatedAt?.toISOString();

    // Nhà bán sửa hồ sơ, nên `updatedAt` đổi.
    await User.updateOne({ _id: VENDOR_ID }, { $set: { shopName: "Ten moi" } });

    actAs(ADMIN_ID, "admin");
    const res = await updateVendorPOST(
      post({
        vendorId: VENDOR_ID.toString(),
        status: "approved",
        expectedUpdatedAt: stale,
      }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("vendor_profile_changed");

    expect((await User.findById(VENDOR_ID))!.verificationStatus).toBe("pending");
  });

  it("hai quản trị viên xử lý đồng thời thì đúng một lượt thành công", async () => {
    const vendor = await pendingVendor();
    const token = vendor.updatedAt?.toISOString();
    actAs(ADMIN_ID, "admin");

    const [a, b] = await Promise.all([
      updateVendorPOST(
        post({
          vendorId: VENDOR_ID.toString(),
          status: "approved",
          expectedUpdatedAt: token,
        }),
      ),
      updateVendorPOST(
        post({
          vendorId: VENDOR_ID.toString(),
          status: "rejected",
          rejectedReason: "Khong hop le",
          expectedUpdatedAt: token,
        }),
      ),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it("không duyệt được hồ sơ chưa đầy đủ", async () => {
    // Hồ sơ pending nhưng thiếu số điện thoại: danh sách của quản trị viên có thể đã cũ.
    await seedVendor({
      shopName: "Shop",
      taxNumber: "010",
      shopAddress: "x",
      verificationStatus: "pending",
    });
    const vendor = (await User.findById(VENDOR_ID))!;
    actAs(ADMIN_ID, "admin");

    const res = await updateVendorPOST(
      post({
        vendorId: VENDOR_ID.toString(),
        status: "approved",
        expectedUpdatedAt: vendor.updatedAt?.toISOString(),
      }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("invalid_vendor_transition");
  });

  it("không duyệt được hồ sơ đang ở draft", async () => {
    await seedVendor();
    const vendor = (await User.findById(VENDOR_ID))!;
    actAs(ADMIN_ID, "admin");

    const res = await updateVendorPOST(
      post({
        vendorId: VENDOR_ID.toString(),
        status: "approved",
        expectedUpdatedAt: vendor.updatedAt?.toISOString(),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("thiếu expectedUpdatedAt thì trả 400", async () => {
    await pendingVendor();
    actAs(ADMIN_ID, "admin");

    const res = await updateVendorPOST(
      post({ vendorId: VENDOR_ID.toString(), status: "approved" }),
    );
    expect(res.status).toBe(400);
  });
});

describe("danh sách nhà bán cho quản trị viên", () => {
  it("chỉ trả pending và approved, kèm thẻ phiên bản", async () => {
    await seedVendor({ verificationStatus: "draft" });
    await User.create({
      name: "V2",
      email: "v2@example.com",
      emailNormalized: "v2@example.com",
      role: "vendor",
      verificationStatus: "pending",
    });
    await User.create({
      name: "V3",
      email: "v3@example.com",
      emailNormalized: "v3@example.com",
      role: "vendor",
      verificationStatus: "rejected",
    });
    actAs(ADMIN_ID, "admin");

    const body = await (await adminVendorsGET()).json();
    expect(body.vendors).toHaveLength(1);
    expect(body.vendors[0].verificationStatus).toBe("pending");
    expect(body.vendors[0].updatedAt).toBeTruthy();
  });

  it("từ chối người không phải quản trị viên", async () => {
    actAs(BUYER_ID, "user");
    expect((await adminVendorsGET()).status).toBe(403);
  });
});
