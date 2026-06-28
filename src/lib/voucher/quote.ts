import { computeFeesByVendor } from "@/lib/ghn";
import Product from "@/model/product.model";
import User from "@/model/user.model";
import UserVoucher from "@/model/userVoucher.model";
import { IVoucher } from "@/model/voucher.model";
import { computeDiscount } from "./discount";
import { clampDiscount, prorateInteger } from "./proration";

export const SERVICE_CHARGE = 15_000;

export type QuoteItemInput = {
  productId: string;
  quantity: number;
  size?: string;
};

export type QuoteInput = {
  userId: string;
  items: QuoteItemInput[];
  addressId: string;
  shopVoucherCodes?: string[];
  platformVoucherCode?: string;
  freeshipVoucherCode?: string;
};

export type VoucherSelection = {
  shopVoucherCodes: string[];
  platformVoucherCode?: string;
  freeshipVoucherCode?: string;
};

export type AppliedVoucherQuote = {
  voucher: string;
  code: string;
  slot: "shop" | "platform" | "freeship";
  discountType: IVoucher["discountType"];
  amount: number;
};

export type PerOrderQuote = {
  productId: string;
  quantity: number;
  size?: string;
  vendorId: string;
  unitPrice: number;
  originalTotal: number;
  deliveryCharge: number;
  serviceCharge: number;
  shopDiscount: number;
  platformDiscount: number;
  freeshipDiscount: number;
  totalDiscount: number;
  totalAmount: number;
  serviceId?: number;
  appliedVouchers: AppliedVoucherQuote[];
};

export type RejectedVoucher = {
  code: string;
  reason:
    | "not_collected"
    | "expired"
    | "inactive"
    | "quota_exhausted"
    | "wrong_slot"
    | "wrong_vendor"
    | "min_spend"
    | "not_applicable"
    | "duplicate_slot";
};

export type OrderQuote = {
  cartSubtotal: number;
  totalShopDiscount: number;
  platformDiscount: number;
  freeshipDiscount: number;
  shippingFeeTotal: number;
  serviceCharge: number;
  finalPayable: number;
  groups: {
    vendorId: string;
    subtotal: number;
    shippingFee: number;
    isFreeDelivery: boolean;
  }[];
  perOrder: PerOrderQuote[];
  rejected: RejectedVoucher[];
};

type Line = {
  index: number;
  productId: string;
  quantity: number;
  size?: string;
  vendorId: string;
  unitPrice: number;
  subtotal: number;
  category: string;
  deliveryCharge: number;
  serviceCharge: number;
  serviceId?: number;
};

export type QuoteContext = {
  lines: Line[];
  feesByVendor: Awaited<ReturnType<typeof computeFeesByVendor>>["feesByVendor"];
  totalFee: number;
  collectedByCode: Map<string, IVoucher>;
};

function normalizeCode(code?: string) {
  return (code ?? "").trim().toUpperCase();
}

function voucherId(voucher: IVoucher) {
  return String(voucher._id);
}

function productMatchesScope(voucher: IVoucher, line: Line) {
  if (voucher.scope === "all") return true;
  if (voucher.scope === "products") {
    return (voucher.applicableProducts ?? []).some(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (product: any) => product.toString() === line.productId,
    );
  }
  if (voucher.scope === "category") {
    return (voucher.applicableCategories ?? []).includes(line.category);
  }
  return false;
}

function isVoucherLive(voucher: IVoucher, now = new Date()) {
  return voucher.isActive && voucher.startAt <= now && voucher.endAt >= now;
}

// Load ALL collected vouchers for a user, keyed by code. Used to build a shared
// QuoteContext so repeated computeOrderQuote calls (recommendation) don't re-query.
async function getAllCollectedVouchers(userId: string) {
  const rows = await UserVoucher.find({ user: userId, status: "collected" })
    .populate({ path: "voucher" })
    .lean();

  const byCode = new Map<string, IVoucher>();
  for (const row of rows) {
    const voucher = row.voucher as unknown as IVoucher | null;
    if (voucher?.code) byCode.set(voucher.code, voucher);
  }
  return byCode;
}

// Build the expensive, voucher-independent part of a quote ONCE: cart lines,
// shipping fees (single GHN call), service charge, and the user's collected
// vouchers. Reused across many computeOrderQuote() calls during recommendation.
export async function buildQuoteContext(input: QuoteInput): Promise<QuoteContext> {
  const user = await User.findById(input.userId).select("cart addresses").lean();
  if (!user) throw new Error("User not found");

  const address = user.addresses?.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (candidate: any) => candidate._id.toString() === input.addressId,
  );
  if (!address) throw new Error("Dia chi giao hang khong ton tai");

  const productIds = input.items.map((item) => item.productId);
  const products = await Product.find({ _id: { $in: productIds } })
    .select("title price stock isStockAvailable sizeStock isWearable vendor category freeDelivery weight length width height")
    .lean();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const productById = new Map(products.map((product: any) => [product._id.toString(), product]));
  const cart = user.cart ?? [];
  const lines: Line[] = [];

  for (const [index, item] of input.items.entries()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const product: any = productById.get(item.productId);
    if (!product) throw new Error("San pham khong ton tai");

    const cartItem = cart.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (candidate: any) =>
        candidate.product.toString() === item.productId &&
        (candidate.size ?? null) === (item.size ?? null),
    );
    if (!cartItem) throw new Error("San pham khong co trong gio hang");
    if (cartItem.quantity !== item.quantity) {
      throw new Error("So luong gio hang da thay doi");
    }

    if (product.isWearable && item.size) {
      const sizeEntry = (product.sizeStock ?? []).find(
        (entry: { size: string; stock: number }) => entry.size === item.size,
      );
      if (!sizeEntry || sizeEntry.stock < item.quantity) {
        throw new Error(`Khong du hang cho size ${item.size}`);
      }
    } else if (product.stock < item.quantity || product.isStockAvailable === false) {
      throw new Error("San pham khong du hang");
    }

    lines.push({
      index,
      productId: item.productId,
      quantity: item.quantity,
      size: item.size,
      vendorId: product.vendor.toString(),
      unitPrice: product.price,
      subtotal: product.price * item.quantity,
      category: product.category,
      deliveryCharge: 0,
      serviceCharge: 0,
    });
  }

  const { feesByVendor, totalFee } = await computeFeesByVendor(address, input.items);
  const feeUsed = new Set<string>();
  for (const line of lines) {
    const vendorFee = feesByVendor.find((fee) => fee.vendorId === line.vendorId);
    if (vendorFee && !feeUsed.has(line.vendorId)) {
      line.deliveryCharge = vendorFee.fee;
      line.serviceId = vendorFee.serviceId;
      feeUsed.add(line.vendorId);
    }
  }
  if (lines[0]) lines[0].serviceCharge = SERVICE_CHARGE;

  const collectedByCode = await getAllCollectedVouchers(input.userId);

  return { lines, feesByVendor, totalFee, collectedByCode };
}

export async function computeOrderQuote(
  input: QuoteInput,
  ctx?: QuoteContext,
): Promise<OrderQuote> {
  const context = ctx ?? (await buildQuoteContext(input));
  const { lines, feesByVendor, totalFee, collectedByCode } = context;
  const collected = collectedByCode;
  const rejected: RejectedVoucher[] = [];

  const shopDiscountByLine = new Array(lines.length).fill(0);
  const platformDiscountByLine = new Array(lines.length).fill(0);
  const freeshipDiscountByLine = new Array(lines.length).fill(0);
  const appliedByLine: AppliedVoucherQuote[][] = lines.map(() => []);

  const shopCodes = [...new Set((input.shopVoucherCodes ?? []).map(normalizeCode).filter(Boolean))];
  const seenShopVendor = new Set<string>();

  for (const code of shopCodes) {
    const voucher = collected.get(code);
    if (!voucher) {
      rejected.push({ code, reason: "not_collected" });
      continue;
    }
    if (!isVoucherLive(voucher)) {
      rejected.push({ code, reason: "expired" });
      continue;
    }
    if (voucher.usedQuota >= voucher.totalQuota) {
      rejected.push({ code, reason: "quota_exhausted" });
      continue;
    }
    if (voucher.discountType === "freeship" || !voucher.vendor) {
      rejected.push({ code, reason: "wrong_slot" });
      continue;
    }
    const vendor = String(voucher.vendor);
    if (seenShopVendor.has(vendor)) {
      rejected.push({ code, reason: "duplicate_slot" });
      continue;
    }
    seenShopVendor.add(vendor);
    const groupLines = lines.filter((line) => line.vendorId === vendor);
    if (groupLines.length === 0) {
      rejected.push({ code, reason: "wrong_vendor" });
      continue;
    }
    const groupSubtotal = groupLines.reduce((sum, line) => sum + line.subtotal, 0);
    if (groupSubtotal < voucher.minSpend) {
      rejected.push({ code, reason: "min_spend" });
      continue;
    }
    const eligibleLines = groupLines.filter((line) => productMatchesScope(voucher, line));
    const eligibleBase = eligibleLines.reduce((sum, line) => sum + line.subtotal, 0);
    if (eligibleBase <= 0) {
      rejected.push({ code, reason: "not_applicable" });
      continue;
    }
    const discount = computeDiscount(voucher, eligibleBase);
    const shares = prorateInteger(discount, eligibleLines.map((line) => line.subtotal));
    eligibleLines.forEach((line, shareIndex) => {
      const amount = clampDiscount(shares[shareIndex], line.subtotal);
      shopDiscountByLine[line.index] += amount;
      appliedByLine[line.index].push({
        voucher: voucherId(voucher),
        code: voucher.code,
        slot: "shop",
        discountType: voucher.discountType,
        amount,
      });
    });
  }

  const platformCode = normalizeCode(input.platformVoucherCode);
  if (platformCode) {
    const voucher = collected.get(platformCode);
    if (!voucher) {
      rejected.push({ code: platformCode, reason: "not_collected" });
    } else if (!isVoucherLive(voucher)) {
      rejected.push({ code: platformCode, reason: "expired" });
    } else if (voucher.usedQuota >= voucher.totalQuota) {
      rejected.push({ code: platformCode, reason: "quota_exhausted" });
    } else if (voucher.discountType === "freeship" || voucher.vendor) {
      rejected.push({ code: platformCode, reason: "wrong_slot" });
    } else {
      const afterShop = lines.reduce(
        (sum, line) => sum + line.subtotal - shopDiscountByLine[line.index],
        0,
      );
      if (afterShop < voucher.minSpend) {
        rejected.push({ code: platformCode, reason: "min_spend" });
      } else {
        const eligibleLines = lines.filter((line) => productMatchesScope(voucher, line));
        const weights = eligibleLines.map(
          (line) => line.subtotal - shopDiscountByLine[line.index],
        );
        const eligibleBase = weights.reduce((sum, weight) => sum + weight, 0);
        if (eligibleBase <= 0) {
          rejected.push({ code: platformCode, reason: "not_applicable" });
        } else {
          const discount = computeDiscount(voucher, eligibleBase);
          const shares = prorateInteger(discount, weights);
          eligibleLines.forEach((line, shareIndex) => {
            const headroom = line.subtotal - shopDiscountByLine[line.index];
            const amount = clampDiscount(shares[shareIndex], headroom);
            platformDiscountByLine[line.index] += amount;
            appliedByLine[line.index].push({
              voucher: voucherId(voucher),
              code: voucher.code,
              slot: "platform",
              discountType: voucher.discountType,
              amount,
            });
          });
        }
      }
    }
  }

  const freeshipCode = normalizeCode(input.freeshipVoucherCode);
  if (freeshipCode) {
    const voucher = collected.get(freeshipCode);
    if (!voucher) {
      rejected.push({ code: freeshipCode, reason: "not_collected" });
    } else if (!isVoucherLive(voucher)) {
      rejected.push({ code: freeshipCode, reason: "expired" });
    } else if (voucher.usedQuota >= voucher.totalQuota) {
      rejected.push({ code: freeshipCode, reason: "quota_exhausted" });
    } else if (voucher.discountType !== "freeship" || voucher.vendor) {
      rejected.push({ code: freeshipCode, reason: "wrong_slot" });
    } else {
      const shippingBase = lines.reduce((sum, line) => sum + line.deliveryCharge, 0);
      // minSpend của freeship tính theo subtotal sau shop discount (nhất quán
      // với khe platform), KHÔNG dùng phí ship làm ngưỡng.
      const afterShop = lines.reduce(
        (sum, line) => sum + line.subtotal - shopDiscountByLine[line.index],
        0,
      );
      if (shippingBase <= 0) {
        rejected.push({ code: freeshipCode, reason: "not_applicable" });
      } else if (afterShop < voucher.minSpend) {
        rejected.push({ code: freeshipCode, reason: "min_spend" });
      } else {
        const discount = computeDiscount(voucher, 0, shippingBase);
        const shares = prorateInteger(discount, lines.map((line) => line.deliveryCharge));
        lines.forEach((line, index) => {
          const amount = clampDiscount(shares[index], line.deliveryCharge);
          if (amount <= 0) return;
          freeshipDiscountByLine[index] += amount;
          appliedByLine[index].push({
            voucher: voucherId(voucher),
            code: voucher.code,
            slot: "freeship",
            discountType: voucher.discountType,
            amount,
          });
        });
      }
    }
  }

  const perOrder = lines.map((line): PerOrderQuote => {
    const shopDiscount = shopDiscountByLine[line.index];
    const platformDiscount = platformDiscountByLine[line.index];
    const freeshipDiscount = freeshipDiscountByLine[line.index];
    const totalDiscount = shopDiscount + platformDiscount + freeshipDiscount;
    const totalAmount = Math.max(
      0,
      line.subtotal -
        shopDiscount -
        platformDiscount +
        line.deliveryCharge -
        freeshipDiscount +
        line.serviceCharge,
    );

    return {
      productId: line.productId,
      quantity: line.quantity,
      size: line.size,
      vendorId: line.vendorId,
      unitPrice: line.unitPrice,
      originalTotal: line.subtotal,
      deliveryCharge: line.deliveryCharge,
      serviceCharge: line.serviceCharge,
      shopDiscount,
      platformDiscount,
      freeshipDiscount,
      totalDiscount,
      totalAmount,
      serviceId: line.serviceId,
      appliedVouchers: appliedByLine[line.index].filter((voucher) => voucher.amount > 0),
    };
  });

  const cartSubtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
  const totalShopDiscount = shopDiscountByLine.reduce((sum, amount) => sum + amount, 0);
  const platformDiscount = platformDiscountByLine.reduce((sum, amount) => sum + amount, 0);
  const freeshipDiscount = freeshipDiscountByLine.reduce((sum, amount) => sum + amount, 0);
  const finalPayable = Math.max(
    0,
    cartSubtotal - totalShopDiscount - platformDiscount + totalFee - freeshipDiscount + SERVICE_CHARGE,
  );

  const groups = [...new Set(lines.map((line) => line.vendorId))].map((vendorId) => {
    const fee = feesByVendor.find((item) => item.vendorId === vendorId);
    return {
      vendorId,
      subtotal: lines
        .filter((line) => line.vendorId === vendorId)
        .reduce((sum, line) => sum + line.subtotal, 0),
      shippingFee: fee?.fee ?? 0,
      isFreeDelivery: fee?.isFreeDelivery ?? false,
    };
  });

  return {
    cartSubtotal,
    totalShopDiscount,
    platformDiscount,
    freeshipDiscount,
    shippingFeeTotal: totalFee,
    serviceCharge: SERVICE_CHARGE,
    finalPayable,
    groups,
    perOrder,
    rejected,
  };
}

// Greedy per-slot recommendation: pick the collected voucher giving the highest
// discount for each slot (best shop per vendor, then best platform on top, then
// best freeship). NOT a global optimum — matches Shopee-style per-slot best.
// Builds the quote context ONCE so only a single GHN fee call is made.
export async function recommendBestVouchers(
  input: QuoteInput,
  ctx?: QuoteContext,
): Promise<VoucherSelection> {
  const context = ctx ?? (await buildQuoteContext(input));
  const candidates = [...context.collectedByCode.values()].filter(
    (voucher) => isVoucherLive(voucher) && voucher.usedQuota < voucher.totalQuota,
  );
  const vendorIds = [...new Set(context.lines.map((line) => line.vendorId))];

  const shopVoucherCodes: string[] = [];
  for (const vendorId of vendorIds) {
    const vendorCandidates = candidates.filter(
      (voucher) =>
        voucher.discountType !== "freeship" &&
        voucher.vendor &&
        String(voucher.vendor) === vendorId,
    );
    let bestCode: string | undefined;
    let bestDiscount = 0;
    for (const voucher of vendorCandidates) {
      const quote = await computeOrderQuote(
        { ...input, shopVoucherCodes: [voucher.code], platformVoucherCode: undefined, freeshipVoucherCode: undefined },
        context,
      );
      if (quote.totalShopDiscount > bestDiscount) {
        bestDiscount = quote.totalShopDiscount;
        bestCode = voucher.code;
      }
    }
    if (bestCode) shopVoucherCodes.push(bestCode);
  }

  let platformVoucherCode: string | undefined;
  let bestPlatform = 0;
  const platformCandidates = candidates.filter(
    (voucher) => voucher.discountType !== "freeship" && !voucher.vendor,
  );
  for (const voucher of platformCandidates) {
    const quote = await computeOrderQuote(
      { ...input, shopVoucherCodes, platformVoucherCode: voucher.code, freeshipVoucherCode: undefined },
      context,
    );
    if (quote.platformDiscount > bestPlatform) {
      bestPlatform = quote.platformDiscount;
      platformVoucherCode = voucher.code;
    }
  }

  let freeshipVoucherCode: string | undefined;
  let bestFreeship = 0;
  const freeshipCandidates = candidates.filter(
    (voucher) => voucher.discountType === "freeship" && !voucher.vendor,
  );
  for (const voucher of freeshipCandidates) {
    const quote = await computeOrderQuote(
      { ...input, shopVoucherCodes, platformVoucherCode, freeshipVoucherCode: voucher.code },
      context,
    );
    if (quote.freeshipDiscount > bestFreeship) {
      bestFreeship = quote.freeshipDiscount;
      freeshipVoucherCode = voucher.code;
    }
  }

  return { shopVoucherCodes, platformVoucherCode, freeshipVoucherCode };
}
