import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IVoucher } from "@/model/voucher.model";
import { computeOrderQuote, recommendBestVouchers, type QuoteInput } from "./quote";

const mocks = vi.hoisted(() => ({
  computeFeesByVendor: vi.fn(),
  productFind: vi.fn(),
  userFindById: vi.fn(),
  userVoucherFind: vi.fn(),
}));

vi.mock("@/lib/ghn", () => ({
  computeFeesByVendor: mocks.computeFeesByVendor,
}));

vi.mock("@/model/product.model", () => ({
  default: {
    find: mocks.productFind,
  },
}));

vi.mock("@/model/user.model", () => ({
  default: {
    findById: mocks.userFindById,
  },
}));

vi.mock("@/model/userVoucher.model", () => ({
  default: {
    find: mocks.userVoucherFind,
  },
}));

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
    code: "VOUCHER",
    title: "Voucher",
    discountType: "fixed",
    discountValue: 10_000,
    minSpend: 0,
    totalQuota: 10,
    usedQuota: 0,
    perUserLimit: 1,
    scope: "all",
    startAt: new Date("2026-01-01T00:00:00.000Z"),
    endAt: new Date("2099-01-01T00:00:00.000Z"),
    isActive: true,
    createdBy: fakeId("admin") as IVoucher["createdBy"],
    ...overrides,
  };
}

function seedCollected(vouchers: IVoucher[]) {
  mocks.userVoucherFind.mockReturnValue(
    queryWithLean(vouchers.map((item) => ({ voucher: item }))),
  );
}

const input: QuoteInput = {
  userId: "user-1",
  addressId: "addr-1",
  items: [{ productId: "product-1", quantity: 1 }],
};

describe("voucher quote", () => {
  beforeEach(() => {
    mocks.computeFeesByVendor.mockReset();
    mocks.productFind.mockReset();
    mocks.userFindById.mockReset();
    mocks.userVoucherFind.mockReset();

    mocks.computeFeesByVendor.mockResolvedValue({
      feesByVendor: [
        {
          vendorId: "vendor-1",
          fee: 30_000,
          serviceId: 53320,
          isFreeDelivery: false,
        },
      ],
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
  });

  it("rejects vendor-owned freeship vouchers in the platform freeship slot", async () => {
    seedCollected([
      voucher({
        code: "VENDORSHIP",
        discountType: "freeship",
        discountValue: 0,
        maxDiscount: 30_000,
        vendor: fakeId("vendor-1") as IVoucher["vendor"],
      }),
    ]);

    const quote = await computeOrderQuote({
      ...input,
      freeshipVoucherCode: "VENDORSHIP",
    });

    expect(quote.freeshipDiscount).toBe(0);
    expect(quote.rejected).toContainEqual({
      code: "VENDORSHIP",
      reason: "wrong_slot",
    });
  });

  it("does not recommend vendor-owned freeship vouchers", async () => {
    seedCollected([
      voucher({
        code: "VENDORSHIP",
        discountType: "freeship",
        discountValue: 0,
        maxDiscount: 30_000,
        vendor: fakeId("vendor-1") as IVoucher["vendor"],
      }),
      voucher({
        code: "PLATSHIP",
        discountType: "freeship",
        discountValue: 0,
        maxDiscount: 10_000,
        vendor: null,
      }),
    ]);

    await expect(recommendBestVouchers(input)).resolves.toMatchObject({
      freeshipVoucherCode: "PLATSHIP",
    });
  });
});
