import { describe, expect, it } from "vitest";
import { getTerminalVoucherSettlement } from "./lifecycle";

function ref(id: string) {
  return { _id: { toString: () => id } };
}

describe("voucher lifecycle settlement", () => {
  it("waits while any order in the batch is still processing", () => {
    expect(
      getTerminalVoucherSettlement(
        [
          { orderStatus: "delivered", appliedVouchers: [{ voucher: ref("platform") }] },
          { orderStatus: "shipped", appliedVouchers: [{ voucher: ref("shop") }] },
        ],
        "platform",
      ),
    ).toBe("pending");
  });

  it("uses a voucher if it was applied to any delivered order", () => {
    expect(
      getTerminalVoucherSettlement(
        [
          { orderStatus: "delivered", appliedVouchers: [{ voucher: ref("platform") }] },
          { orderStatus: "cancelled", appliedVouchers: [{ voucher: ref("platform") }] },
        ],
        "platform",
      ),
    ).toBe("used");
  });

  it("handles ObjectId-like voucher refs whose _id points to themselves", () => {
    const objectIdLike = {
      toHexString: () => "platform",
    } as { _id?: unknown; toHexString: () => string };
    objectIdLike._id = objectIdLike;

    expect(
      getTerminalVoucherSettlement(
        [{ orderStatus: "delivered", appliedVouchers: [{ voucher: objectIdLike }] }],
        "platform",
      ),
    ).toBe("used");
  });

  it("releases a voucher that only belonged to cancelled orders", () => {
    expect(
      getTerminalVoucherSettlement(
        [
          { orderStatus: "delivered", appliedVouchers: [{ voucher: ref("platform") }] },
          { orderStatus: "cancelled", appliedVouchers: [{ voucher: ref("shop") }] },
        ],
        "shop",
      ),
    ).toBe("release");
  });
});
