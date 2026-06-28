import Voucher, { IVoucher } from "@/model/voucher.model";
import UserVoucher, { UserVoucherStatus } from "@/model/userVoucher.model";
import {
  buildQuoteContext,
  computeOrderQuote,
  type QuoteContext,
  type QuoteInput,
} from "./quote";
import type { CandidateSlot, VoucherCandidate } from "./candidateTypes";

export type {
  CandidateSlot,
  CandidateReason,
  VoucherCandidate,
} from "./candidateTypes";

type ScopeLine = { productId: string; category: string };
type CurrentStack = {
  afterShopSubtotal: number;
  shopDiscountByLine: number[];
};

function normalizeCode(code?: string) {
  return (code ?? "").trim().toUpperCase();
}

function slotOf(voucher: IVoucher): CandidateSlot {
  if (voucher.discountType === "freeship") return "freeship";
  return voucher.vendor ? "shop" : "platform";
}

function matchesScope(voucher: IVoucher, line: ScopeLine): boolean {
  if (voucher.scope === "all") return true;
  if (voucher.scope === "products") {
    return (voucher.applicableProducts ?? []).some(
      (product) => product.toString() === line.productId,
    );
  }
  if (voucher.scope === "category") {
    return (voucher.applicableCategories ?? []).includes(line.category);
  }
  return false;
}

// Ước lượng số tiền giảm thực tế bằng chính computeOrderQuote (tái dùng logic
// proration/clamp), bằng cách "tiêm" voucher vào ctx như thể đã lưu trong ví.
async function estimateDiscount(
  input: QuoteInput,
  ctx: QuoteContext,
  voucher: IVoucher,
  slot: CandidateSlot,
): Promise<number> {
  const ctx2: QuoteContext = {
    ...ctx,
    collectedByCode: new Map(ctx.collectedByCode).set(normalizeCode(voucher.code), voucher),
  };
  const selection = candidateSelection(input, ctx2, voucher, slot);

  const quote = await computeOrderQuote(selection, ctx2);
  return quote.perOrder.reduce(
    (sum, order) =>
      sum +
      order.appliedVouchers
        .filter((applied) => applied.slot === slot && applied.code === voucher.code)
        .reduce((lineSum, applied) => lineSum + applied.amount, 0),
    0,
  );
}

function candidateSelection(
  input: QuoteInput,
  ctx: QuoteContext,
  voucher: IVoucher,
  slot: CandidateSlot,
): QuoteInput {
  if (slot === "shop") {
    const vendorId = String(voucher.vendor);
    const keptShopCodes = (input.shopVoucherCodes ?? []).filter((code) => {
      const current = ctx.collectedByCode.get(normalizeCode(code));
      return String(current?.vendor ?? "") !== vendorId;
    });
    return {
      ...input,
      shopVoucherCodes: [...new Set([...keptShopCodes, voucher.code])],
    };
  }

  if (slot === "platform") {
    return { ...input, platformVoucherCode: voucher.code };
  }

  return { ...input, freeshipVoucherCode: voucher.code };
}

async function computeCurrentStack(input: QuoteInput, ctx: QuoteContext): Promise<CurrentStack> {
  const quote = await computeOrderQuote(input, ctx);
  const shopDiscountByLine = quote.perOrder.map((order) => order.shopDiscount);
  return {
    afterShopSubtotal: quote.perOrder.reduce(
      (sum, order) => sum + order.originalTotal - order.shopDiscount,
      0,
    ),
    shopDiscountByLine,
  };
}

async function evaluateOne(
  input: QuoteInput,
  ctx: QuoteContext,
  voucher: IVoucher,
  walletByVoucherId: Map<string, UserVoucherStatus>,
  currentStack: CurrentStack,
  now: Date,
): Promise<VoucherCandidate> {
  const slot = slotOf(voucher);
  const id = String(voucher._id);
  const walletStatus = walletByVoucherId.get(id) ?? null;
  const collected = walletStatus === "collected";

  const base: VoucherCandidate = {
    voucherId: id,
    code: voucher.code,
    title: voucher.title,
    description: voucher.description,
    discountType: voucher.discountType,
    discountValue: voucher.discountValue,
    maxDiscount: voucher.maxDiscount,
    minSpend: voucher.minSpend ?? 0,
    endAt: voucher.endAt ? new Date(voucher.endAt).toISOString() : undefined,
    slot,
    vendorId: voucher.vendor ? String(voucher.vendor) : null,
    eligible: false,
    estimatedDiscount: 0,
    missingAmount: 0,
    collected,
    walletStatus,
  };

  // Trạng thái ví chặn dùng lại.
  if (walletStatus === "reserved") return { ...base, reason: "reserved" };
  if (walletStatus === "used") return { ...base, reason: "used" };
  if (walletStatus === "expired") return { ...base, reason: "expired" };

  // Cửa sổ thời gian.
  if (!collected && voucher.collectStartAt && new Date(voucher.collectStartAt) > now) {
    return { ...base, reason: "not_started" };
  }
  if (voucher.startAt && new Date(voucher.startAt) > now) {
    return { ...base, reason: "not_started" };
  }
  if (!voucher.isActive || (voucher.endAt && new Date(voucher.endAt) < now)) {
    return { ...base, reason: "expired" };
  }

  // Quota tổng.
  if (voucher.usedQuota >= voucher.totalQuota) {
    return { ...base, reason: "quota_exhausted" };
  }

  const lines = ctx.lines;
  const minSpend = voucher.minSpend ?? 0;

  if (slot === "shop") {
    const vendor = String(voucher.vendor);
    const groupLines = lines.filter((line) => line.vendorId === vendor);
    if (groupLines.length === 0) return { ...base, reason: "wrong_vendor" };
    const groupSubtotal = groupLines.reduce((sum, line) => sum + line.subtotal, 0);
    if (groupSubtotal < minSpend) {
      return { ...base, reason: "min_spend", missingAmount: minSpend - groupSubtotal };
    }
    const eligibleBase = groupLines
      .filter((line) => matchesScope(voucher, line))
      .reduce((sum, line) => sum + line.subtotal, 0);
    if (eligibleBase <= 0) return { ...base, reason: "not_applicable" };
  } else if (slot === "platform") {
    if (currentStack.afterShopSubtotal < minSpend) {
      return {
        ...base,
        reason: "min_spend",
        missingAmount: minSpend - currentStack.afterShopSubtotal,
      };
    }
    const eligibleBase = lines
      .filter((line) => matchesScope(voucher, line))
      .reduce(
        (sum, line) =>
          sum +
          Math.max(0, line.subtotal - (currentStack.shopDiscountByLine[line.index] ?? 0)),
        0,
      );
    if (eligibleBase <= 0) return { ...base, reason: "not_applicable" };
  } else {
    const shippingBase = lines.reduce((sum, line) => sum + line.deliveryCharge, 0);
    if (shippingBase <= 0) return { ...base, reason: "not_applicable" };
    if (currentStack.afterShopSubtotal < minSpend) {
      return {
        ...base,
        reason: "min_spend",
        missingAmount: minSpend - currentStack.afterShopSubtotal,
      };
    }
  }

  const estimatedDiscount = await estimateDiscount(input, ctx, voucher, slot);
  return {
    ...base,
    eligible: true,
    estimatedDiscount,
    // Đủ điều kiện nhưng chưa lưu -> hiển thị để user bấm "Lưu & chọn".
    reason: collected ? undefined : "not_collected",
  };
}

// Liệt kê toàn bộ voucher có thể liên quan tới giỏ hàng hiện tại (đã lưu trong ví
// + voucher public còn hiệu lực của sàn/đúng vendor), kèm lý do dùng được/không.
export async function evaluateVoucherCandidates(
  input: QuoteInput,
  ctx?: QuoteContext,
): Promise<VoucherCandidate[]> {
  const context = ctx ?? (await buildQuoteContext(input));
  const now = new Date();
  const currentStack = await computeCurrentStack(input, context);

  // Toàn bộ ví của user (mọi trạng thái) để biết walletStatus + reason reserved/used.
  const walletRows = await UserVoucher.find({ user: input.userId })
    .populate({ path: "voucher" })
    .lean();

  const walletByVoucherId = new Map<string, UserVoucherStatus>();
  const byId = new Map<string, IVoucher>();
  for (const row of walletRows) {
    const voucher = row.voucher as unknown as IVoucher | null;
    if (!voucher?._id) continue;
    const id = String(voucher._id);
    walletByVoucherId.set(id, row.status as UserVoucherStatus);
    byId.set(id, voucher);
  }

  // Voucher public còn hiệu lực, áp cho sàn (vendor null) hoặc đúng vendor trong giỏ.
  const cartVendorIds = [...new Set(context.lines.map((line) => line.vendorId))];
  const publicVouchers = (await Voucher.find({
    isActive: true,
    endAt: { $gte: now },
    $or: [{ vendor: null }, { vendor: { $in: cartVendorIds } }],
  }).lean()) as unknown as IVoucher[];
  for (const voucher of publicVouchers) {
    const id = String(voucher._id);
    if (!byId.has(id)) byId.set(id, voucher);
  }

  const candidates: VoucherCandidate[] = [];
  for (const voucher of byId.values()) {
    candidates.push(
      await evaluateOne(input, context, voucher, walletByVoucherId, currentStack, now),
    );
  }

  // Dùng được trước, trong mỗi nhóm xếp theo tiền giảm dự kiến giảm dần.
  candidates.sort(
    (a, b) =>
      Number(b.eligible) - Number(a.eligible) ||
      b.estimatedDiscount - a.estimatedDiscount,
  );
  return candidates;
}
