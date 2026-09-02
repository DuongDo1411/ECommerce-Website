import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";

// Cloudinary SDK bị mock hoàn toàn — test không được gọi mạng thật. `upload_stream` giả lập
// đúng shape stream-callback của SDK thật (`.end(buffer)` rồi gọi callback(err, result)).
const cloudinaryMocks = vi.hoisted(() => ({
  config: vi.fn(),
  uploadStream: vi.fn((options: { public_id: string }, callback: (err: unknown, result: unknown) => void) => ({
    end: () => callback(null, { public_id: options.public_id }),
  })),
  destroy: vi.fn(async () => ({ result: "ok" })),
  url: vi.fn(
    (publicId: string, opts: { raw_transformation: string }) =>
      `https://res.cloudinary.com/test/${publicId}?t=${encodeURIComponent(opts.raw_transformation)}`,
  ),
}));
vi.mock("cloudinary", () => ({
  v2: {
    config: cloudinaryMocks.config,
    uploader: { upload_stream: cloudinaryMocks.uploadStream, destroy: cloudinaryMocks.destroy },
    url: cloudinaryMocks.url,
  },
}));

import User from "../../src/model/user.model";
import Product from "../../src/model/product.model";
import { buildManifest, hashManifestContent, verifyManifestIntegrity, type VendorInput } from "./manifest";

type GlobalWithMongoose = typeof globalThis & {
  mongoose?: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  };
};

let replset: MongoMemoryReplSet;
let runInspect: typeof import("./inspect").runInspect;
let commitManifest: typeof import("./commit").commitManifest;
let rollbackRun: typeof import("./rollback").rollbackRun;
let getSeedRun: typeof import("./seedRuns").getSeedRun;
let resolveManifestImages: typeof import("./images").resolveManifestImages;

const FAKE_PEXELS_KEY = "fake-pexels-key";

/** Giả lập cả Pexels search lẫn tải ảnh — không gọi mạng thật trong test. */
async function fakeFetch(input: string | URL | Request): Promise<Response> {
  const url = String(input);
  if (url.startsWith("https://api.pexels.com/")) {
    return new Response(
      JSON.stringify({
        photos: [
          {
            url: `https://www.pexels.com/photo/fake?u=${encodeURIComponent(url)}`,
            photographer: "Fake Photographer",
            src: { large2x: `https://images.pexels.com/fake.jpg?u=${encodeURIComponent(url)}` },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  // Tải ảnh: trả một buffer JPEG giả nhỏ.
  return new Response(new Uint8Array(1024), { status: 200, headers: { "content-type": "image/jpeg" } });
}

function vendorInput(overrides: Partial<VendorInput> = {}): VendorInput {
  return {
    vendorId: "",
    shopName: "Shop Test",
    existingApprovedActiveCount: 0,
    existingCategories: [],
    existingTitles: [],
    category: "Books & Stationery",
    needsReview: false,
    ...overrides,
  };
}

async function seedApprovedVendor(overrides: Record<string, unknown> = {}) {
  return User.create({
    name: "Vendor",
    email: `vendor-${new mongoose.Types.ObjectId().toString()}@example.com`,
    role: "vendor",
    verificationStatus: "approved",
    isApproved: true,
    ...overrides,
  });
}

async function seedProduct(vendorId: mongoose.Types.ObjectId, overrides: Record<string, unknown> = {}) {
  return Product.create({
    title: `Sản phẩm có sẵn ${new mongoose.Types.ObjectId().toString()}`,
    description: "desc",
    price: 100_000,
    stock: 10,
    isStockAvailable: true,
    vendor: vendorId,
    image1: "a",
    image2: "b",
    image3: "c",
    image4: "d",
    category: "Books & Stationery",
    isWearable: false,
    verificationStatus: "approved",
    isActive: true,
    ...overrides,
  });
}

async function buildResolvedManifest(seed: string, target: number, vendors: VendorInput[]) {
  const runId = `${seed}-${vendors.map((v) => v.vendorId).join("-")}`;
  const manifest = buildManifest({ seed, target, vendors, runId });
  const { manifest: resolved } = await resolveManifestImages(manifest, FAKE_PEXELS_KEY, fakeFetch);
  return resolved;
}

beforeAll(async () => {
  // `runInspect`/`commit.ts` gọi `resolveManifestImages`/`downloadAndValidateImage` KHÔNG kèm
  // tham số `fetchImpl` (đúng như cách CLI thật gọi) — nên phải giả `fetch` toàn cục, không chỉ
  // truyền `fakeFetch` cho những chỗ test tự gọi trực tiếp.
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replset.getUri();
  process.env.MONGODB_URL = uri;
  await mongoose.connect(uri);
  (globalThis as GlobalWithMongoose).mongoose = {
    conn: mongoose.connection,
    promise: Promise.resolve(mongoose.connection),
  };
  ({ runInspect } = await import("./inspect"));
  ({ commitManifest } = await import("./commit"));
  ({ rollbackRun } = await import("./rollback"));
  ({ getSeedRun } = await import("./seedRuns"));
  ({ resolveManifestImages } = await import("./images"));
}, 120_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await mongoose.disconnect();
  await replset.stop();
});

afterEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Product.deleteMany({}),
    mongoose.connection.db?.collection("seed_runs").deleteMany({}),
  ]);
  cloudinaryMocks.uploadStream.mockClear();
  cloudinaryMocks.destroy.mockClear();
});

describe("runInspect — đếm đúng theo DB thật", () => {
  it("chỉ tính approved+active vào existingApprovedActiveCount, bỏ qua pending/rejected/inactive", async () => {
    const vendor = await seedApprovedVendor();
    await seedProduct(vendor._id, { verificationStatus: "approved", isActive: true });
    await seedProduct(vendor._id, { verificationStatus: "approved", isActive: true });
    await seedProduct(vendor._id, { verificationStatus: "pending", isActive: true });
    await seedProduct(vendor._id, { verificationStatus: "rejected", isActive: true });
    await seedProduct(vendor._id, { verificationStatus: "approved", isActive: false });

    const outcome = await runInspect({
      target: 15,
      seed: "inspect-count-test",
      runId: "inspect-count-test-run",
      vendorEmails: [vendor.email!],
      pexelsApiKey: FAKE_PEXELS_KEY,
    });

    expect(outcome.manifest.vendors).toHaveLength(1);
    expect(outcome.manifest.vendors[0].existingApprovedActiveCount).toBe(2);
    expect(outcome.manifest.vendors[0].toAdd).toBe(13);
    expect(outcome.manifest.vendors[0].products).toHaveLength(13);
  });
});

describe("commitManifest — ghi Product + vendorProducts trong một transaction", () => {
  it("tạo đúng số Product, đủ 4 URL ảnh Cloudinary, gắn vào vendorProducts", async () => {
    const vendor = await seedApprovedVendor();
    const manifest = await buildResolvedManifest("commit-basic", 3, [
      vendorInput({ vendorId: vendor._id.toString(), existingApprovedActiveCount: 0 }),
    ]);

    const report = await commitManifest(manifest, { confirmDb: mongoose.connection.db!.databaseName });

    expect(report.vendors[0].status).toBe("committed");
    expect(report.vendors[0].createdCount).toBe(3);

    const products = await Product.find({ vendor: vendor._id }).lean();
    expect(products).toHaveLength(3);
    for (const p of products) {
      expect(p.verificationStatus).toBe("approved");
      expect(p.isActive).toBe(true);
      for (const field of ["image1", "image2", "image3", "image4"] as const) {
        expect(p[field]).toMatch(/^https:\/\/res\.cloudinary\.com\/test\//);
      }
    }

    const updatedVendor = await User.findById(vendor._id).lean();
    const linkedIds = (updatedVendor!.vendorProducts ?? []).map(String);
    for (const p of products) {
      expect(linkedIds).toContain(String(p._id));
    }
  });

  it("commit lại cùng manifest không tạo trùng dữ liệu", async () => {
    const vendor = await seedApprovedVendor();
    const manifest = await buildResolvedManifest("commit-twice", 3, [
      vendorInput({ vendorId: vendor._id.toString(), existingApprovedActiveCount: 0 }),
    ]);

    const confirmDb = mongoose.connection.db!.databaseName;
    await commitManifest(manifest, { confirmDb });
    const secondReport = await commitManifest(manifest, { confirmDb });

    expect(secondReport.vendors[0].status).toBe("already_committed");
    const products = await Product.find({ vendor: vendor._id }).lean();
    expect(products).toHaveLength(3);
  });

  it("lỗi giữa transaction (duplicate _id) không để lại Product/link dở dang", async () => {
    const vendor = await seedApprovedVendor();
    const manifest = await buildResolvedManifest("commit-fail", 3, [
      vendorInput({ vendorId: vendor._id.toString(), existingApprovedActiveCount: 0 }),
    ]);
    // Ép trùng _id giữa hai sản phẩm để insertMany (ordered) ném lỗi giữa chừng. Bài test này
    // nhắm vào hành vi rollback-khi-lỗi-Mongo, không phải kiểm hash — nên phải tính lại hash cho
    // khớp nội dung đã sửa, kẻo commitManifest từ chối sớm vì "hash không khớp" (đúng hành vi,
    // nhưng là một bài test khác — đã có ở "manifest bị sửa tay...").
    manifest.vendors[0].products[1].productId = manifest.vendors[0].products[0].productId;
    manifest.manifestHash = hashManifestContent({
      seed: manifest.seed,
      target: manifest.target,
      vendors: manifest.vendors,
    });

    const report = await commitManifest(manifest, { confirmDb: mongoose.connection.db!.databaseName });

    expect(report.vendors[0].status).toBe("failed");
    const products = await Product.find({ vendor: vendor._id }).lean();
    expect(products).toHaveLength(0);
    const updatedVendor = await User.findById(vendor._id).lean();
    expect(updatedVendor!.vendorProducts ?? []).toHaveLength(0);
  });

  it("vendor bị thu hồi duyệt sau inspect bị bỏ qua khi commit, không tạo gì", async () => {
    const vendor = await seedApprovedVendor();
    const manifest = await buildResolvedManifest("commit-revoked", 3, [
      vendorInput({ vendorId: vendor._id.toString(), existingApprovedActiveCount: 0 }),
    ]);

    await User.updateOne({ _id: vendor._id }, { verificationStatus: "pending" });

    const report = await commitManifest(manifest, { confirmDb: mongoose.connection.db!.databaseName });
    expect(report.vendors[0].status).toBe("failed");
    expect(report.vendors[0].message).toMatch(/approved/i);
    const products = await Product.find({ vendor: vendor._id }).lean();
    expect(products).toHaveLength(0);
  });

  it("manifest bị sửa tay sau khi tạo (hash sai) bị từ chối, không ghi gì", async () => {
    const vendor = await seedApprovedVendor();
    const manifest = await buildResolvedManifest("commit-tamper", 3, [
      vendorInput({ vendorId: vendor._id.toString(), existingApprovedActiveCount: 0 }),
    ]);
    manifest.vendors[0].products[0].price = manifest.vendors[0].products[0].price + 1;
    expect(verifyManifestIntegrity(manifest)).toBe(false);

    await expect(
      commitManifest(manifest, { confirmDb: mongoose.connection.db!.databaseName }),
    ).rejects.toThrow(/hash/i);

    const products = await Product.find({ vendor: vendor._id }).lean();
    expect(products).toHaveLength(0);
  });

  it("--confirm-db sai database bị từ chối, không ghi gì", async () => {
    const vendor = await seedApprovedVendor();
    const manifest = await buildResolvedManifest("commit-wrong-db", 3, [
      vendorInput({ vendorId: vendor._id.toString(), existingApprovedActiveCount: 0 }),
    ]);

    await expect(commitManifest(manifest, { confirmDb: "khong-phai-db-nay" })).rejects.toThrow();

    const products = await Product.find({ vendor: vendor._id }).lean();
    expect(products).toHaveLength(0);
  });
});

describe("rollbackRun — gỡ đúng dữ liệu của run, không đụng dữ liệu có trước", () => {
  it("xóa đúng Product/vendorProducts/Cloudinary asset của run, giữ nguyên sản phẩm có trước", async () => {
    const vendor = await seedApprovedVendor();
    const preExisting = await seedProduct(vendor._id);
    await User.updateOne({ _id: vendor._id }, { $addToSet: { vendorProducts: preExisting._id } });

    // target=4, existing=1 -> toAdd=3, tổng sau commit = 4.
    const manifest = await buildResolvedManifest("rollback-basic", 4, [
      vendorInput({ vendorId: vendor._id.toString(), existingApprovedActiveCount: 1 }),
    ]);
    const confirmDb = mongoose.connection.db!.databaseName;
    await commitManifest(manifest, { confirmDb });

    expect(await Product.countDocuments({ vendor: vendor._id })).toBe(4);

    const rollbackReport = await rollbackRun(manifest.runId, { confirmDb });
    expect(rollbackReport.vendors[0].status).toBe("rolled_back");
    expect(rollbackReport.vendors[0].deletedProductCount).toBe(3);

    const remaining = await Product.find({ vendor: vendor._id }).lean();
    expect(remaining).toHaveLength(1);
    expect(String(remaining[0]._id)).toBe(String(preExisting._id));

    const updatedVendor = await User.findById(vendor._id).lean();
    const linkedIds = (updatedVendor!.vendorProducts ?? []).map(String);
    expect(linkedIds).toEqual([String(preExisting._id)]);

    expect(cloudinaryMocks.destroy).toHaveBeenCalledTimes(3);

    const run = await getSeedRun(manifest.runId);
    expect(run?.status).toBe("rolled_back");
  });
});
