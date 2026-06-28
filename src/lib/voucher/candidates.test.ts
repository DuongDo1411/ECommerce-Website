import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IVoucher } from "@/model/voucher.model";
import type { UserVoucherStatus } from "@/model/userVoucher.model";
import { evaluateVoucherCandidates } from "./candidates";
import { recommendBestVouchers } from "./quote";

const mocks = vi.hoisted(() => ({
  computeFeesByVendor: vi.fn(),
  productFind: vi.fn(),
  userFindById: vi.fn(),
  userVoucherFind: vi.fn(),
  voucherFind: vi.fn(),
}));

vi.mock("@/lib/ghn", () => ({ computeFeesByVendor: mocks.computeFeesByVendor }));
vi.mock("@/model/product.model", () => ({ default: { find: mocks.productFind } }));
vi.mock("@/model/user.model", () => ({ default: { findById: mocks.userFindById } }));
vi.mock("@/model/userVoucher.model", () => ({ default: { find: mocks.userVoucherFind } }));
vi.mock("@/model/voucher.model", () => ({ default: { find: mocks.voucherFind } }));

function fakeId(value: string) {
  return { toString: () => value };
}

function queryWithLean<T>(value: T) {
  const query = {
    select: vi.fn(),
    populate: vi.fn(),
    lean: vi.fn<() => Promise<T>>(),
  };
  query.select.mockReturnValue(query);
  query.populate.mockReturnValue(query);
  query.lean.mockImplementation(async () => value);
  return query;
}

function voucher(overrides: Partial<IVoucher>): IVoucher {
  return {
    _id: fakeId(`${overrides.code ?? "VOUCHER"}-id`) as IVoucher["_id"],
    code: overrides.code ?? "VOUCHER",
    title: "Voucher",
    discountType: "fixed",
    discountValue: 10_000,
    minSpend: 0,
    totalQuota: 10,
    usedQuota: 0,
    perUserLimit: 1,
    scope: "all",
    startAt: new Date("2020-01-01T00:00:00.000Z"),
    endAt: new Date("2099-01-01T00:00:00.000Z"),
    isActive: true,
    createdBy: fakeId("admin") as IVoucher["createdBy"],
    ...overrides,
  };
}

function setWallet(rows: { voucher: IVoucher; status: UserVoucherStatus }[]) {
  mocks.userVoucherFind.mockReturnValue(queryWithLean(rows));
}

function setPublic(vouchers: IVoucher[]) {
  mocks.voucherFind.mockReturnValue(queryWithLean(vouchers));
}

const input = {
  userId: "user-1",
  addressId: "addr-1",
  items: [{ productId: "product-1", quantity: 1 }],
};

describe("voucher candidates", () => {
  beforeEach(() => {
    mocks.computeFeesByVendor.mockReset();
    mocks.productFind.mockReset();
    mocks.userFindById.mockReset();
    mocks.userVoucherFind.mockReset();
    mocks.voucherFind.mockReset();

    mocks.computeFeesByVendor.mockResolvedValue({
      feesByVendor: [{ vendorId: "vendor-1", fee: 30_000, serviceId: 1, isFreeDelivery: false }],
      totalFee: 30_000,
    });
    mocks.userFindById.mockReturnValue(
      queryWithLean({
        addresses: [{ _id: fakeId("addr-1") }],
        cart: [{ product: fakeId("product-1"), quantity: 1 }],
      }),
    );
    mocks.productFind.mockReturnValue(
      queryWithLean([
        {
          _id: fakeId("product-1"),
          title: "Product",
          price: 100_000,
          stock: 5,
          isStockAvailable: true,
          isWearable: false,
          vendor: fakeId("vendor-1"),
          category: "eco",
        },
      ]),
    );
    setWallet([]);
    setPublic([]);
  });

  it("voucher chưa lưu nhưng đủ điều kiện xuất hiện với not_collected, eligible", async () => {
    setPublic([voucher({ code: "SAVE10", vendor: null, discountValue: 10_000 })]);

    const candidates = await evaluateVoucherCandidates(input);
    const save10 = candidates.find((c) => c.code === "SAVE10");

    expect(save10).toBeTruthy();
    expect(save10?.eligible).toBe(true);
    expect(save10?.collected).toBe(false);
    expect(save10?.reason).toBe("not_collected");
    expect(save10?.slot).toBe("platform");
    expect(save10?.estimatedDiscount).toBe(10_000);
  });

  it("voucher thiếu min spend trả missingAmount đúng", async () => {
    setWallet([
      { voucher: voucher({ code: "BIG", vendor: null, minSpend: 200_000 }), status: "collected" },
    ]);

    const candidates = await evaluateVoucherCandidates(input);
    const big = candidates.find((c) => c.code === "BIG");

    expect(big?.eligible).toBe(false);
    expect(big?.reason).toBe("min_spend");
    expect(big?.missingAmount).toBe(100_000); // 200k - subtotal 100k
  });

  it("shop voucher sai vendor bị disabled (wrong_vendor)", async () => {
    setWallet([
      {
        voucher: voucher({ code: "OTHERSHOP", vendor: fakeId("vendor-2") as IVoucher["vendor"] }),
        status: "collected",
      },
    ]);

    const candidates = await evaluateVoucherCandidates(input);
    const v = candidates.find((c) => c.code === "OTHERSHOP");

    expect(v?.slot).toBe("shop");
    expect(v?.eligible).toBe(false);
    expect(v?.reason).toBe("wrong_vendor");
  });

  it("shop voucher đúng vendor nhưng sai scope sản phẩm bị disabled (not_applicable)", async () => {
    setWallet([
      {
        voucher: voucher({
          code: "SCOPED",
          vendor: fakeId("vendor-1") as IVoucher["vendor"],
          scope: "products",
          applicableProducts: [fakeId("product-2") as never],
        }),
        status: "collected",
      },
    ]);

    const candidates = await evaluateVoucherCandidates(input);
    const v = candidates.find((c) => c.code === "SCOPED");

    expect(v?.eligible).toBe(false);
    expect(v?.reason).toBe("not_applicable");
  });

  it("voucher reserved/used không được chọn", async () => {
    setWallet([
      { voucher: voucher({ code: "RES", vendor: null }), status: "reserved" },
      { voucher: voucher({ code: "USED", vendor: null }), status: "used" },
    ]);

    const candidates = await evaluateVoucherCandidates(input);
    expect(candidates.find((c) => c.code === "RES")).toMatchObject({
      eligible: false,
      reason: "reserved",
    });
    expect(candidates.find((c) => c.code === "USED")).toMatchObject({
      eligible: false,
      reason: "used",
    });
  });

  it("auto-recommend chỉ chọn voucher đã lưu, bỏ qua voucher public chưa lưu dù lợi hơn", async () => {
    setWallet([
      { voucher: voucher({ code: "SAVED10", vendor: null, discountValue: 10_000 }), status: "collected" },
    ]);
    setPublic([voucher({ code: "PUBLIC50", vendor: null, discountValue: 50_000 })]);

    const recommended = await recommendBestVouchers(input);
    expect(recommended.platformVoucherCode).toBe("SAVED10");
    expect(mocks.computeFeesByVendor).toHaveBeenCalledTimes(1);
  });

  it("public voucher before collectStartAt is disabled", async () => {
    setPublic([
      voucher({
        code: "EARLY",
        vendor: null,
        collectStartAt: new Date("2099-01-01T00:00:00.000Z"),
        endAt: new Date("2100-01-01T00:00:00.000Z"),
      }),
    ]);

    const candidates = await evaluateVoucherCandidates(input);
    expect(candidates.find((c) => c.code === "EARLY")).toMatchObject({
      eligible: false,
      reason: "not_started",
    });
  });

  it("expired wallet voucher is not selectable even if voucher is live", async () => {
    setWallet([
      { voucher: voucher({ code: "OLD", vendor: null }), status: "expired" },
    ]);

    const candidates = await evaluateVoucherCandidates(input);
    expect(candidates.find((c) => c.code === "OLD")).toMatchObject({
      eligible: false,
      reason: "expired",
    });
  });

  it("platform min spend uses subtotal after selected shop vouchers", async () => {
    setWallet([
      {
        voucher: voucher({
          code: "SHOP60",
          vendor: fakeId("vendor-1") as IVoucher["vendor"],
          discountValue: 60_000,
        }),
        status: "collected",
      },
      {
        voucher: voucher({
          code: "PLAT50",
          vendor: null,
          minSpend: 50_000,
        }),
        status: "collected",
      },
    ]);

    const candidates = await evaluateVoucherCandidates({
      ...input,
      shopVoucherCodes: ["SHOP60"],
    });

    expect(candidates.find((c) => c.code === "PLAT50")).toMatchObject({
      eligible: false,
      reason: "min_spend",
      missingAmount: 10_000,
    });
  });

  it("platform estimated discount respects selected shop vouchers", async () => {
    setWallet([
      {
        voucher: voucher({
          code: "SHOP60",
          vendor: fakeId("vendor-1") as IVoucher["vendor"],
          discountValue: 60_000,
        }),
        status: "collected",
      },
      {
        voucher: voucher({
          code: "PLAT50",
          vendor: null,
          discountValue: 50_000,
        }),
        status: "collected",
      },
    ]);

    const candidates = await evaluateVoucherCandidates({
      ...input,
      shopVoucherCodes: ["SHOP60"],
    });

    expect(candidates.find((c) => c.code === "PLAT50")).toMatchObject({
      eligible: true,
      estimatedDiscount: 40_000,
    });
  });
});
