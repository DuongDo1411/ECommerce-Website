// Helper thuần (không I/O) cho query voucher: pagination, slot filter, manager
// state filter, search, sort. Trả về object filter/sort dùng thẳng cho Mongoose.

export type Pagination = { page: number; limit: number; skip: number };

export function parsePagination(
  pageRaw: string | null | undefined,
  limitRaw: string | null | undefined,
  opts: { defaultLimit?: number; maxLimit?: number } = {},
): Pagination {
  const defaultLimit = opts.defaultLimit ?? 24;
  const maxLimit = opts.maxLimit ?? 50;

  const parsedPage = Math.floor(Number(pageRaw));
  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

  const parsedLimit = Math.floor(Number(limitRaw));
  let limit =
    Number.isFinite(parsedLimit) && parsedLimit >= 1 ? parsedLimit : defaultLimit;
  if (limit > maxLimit) limit = maxLimit;

  return { page, limit, skip: (page - 1) * limit };
}

export type PublicSlot = "all" | "platform" | "shop" | "freeship";

// slot dựa trên vendor + discountType (nhất quán với inferVoucherSlot phía client).
export function buildSlotFilter(slot: string | null | undefined): Record<string, unknown> {
  switch (slot) {
    case "platform":
      return { vendor: null, discountType: { $ne: "freeship" } };
    case "shop":
      return { vendor: { $ne: null }, discountType: { $ne: "freeship" } };
    case "freeship":
      return { discountType: "freeship" };
    default:
      return {};
  }
}

export type ManagerState =
  | "all"
  | "running"
  | "scheduled"
  | "expiring"
  | "exhausted"
  | "off"
  | "ended";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export function buildStateFilter(
  state: string | null | undefined,
  now = new Date(),
): Record<string, unknown> {
  const expiringCutoff = new Date(now.getTime() + THREE_DAYS_MS);
  switch (state) {
    case "running":
      return {
        isActive: true,
        startAt: { $lte: now },
        endAt: { $gte: now },
        $expr: { $lt: ["$usedQuota", "$totalQuota"] },
      };
    case "scheduled":
      return { isActive: true, startAt: { $gt: now } };
    case "expiring":
      return {
        isActive: true,
        startAt: { $lte: now },
        endAt: { $gte: now, $lte: expiringCutoff },
        $expr: { $lt: ["$usedQuota", "$totalQuota"] },
      };
    case "exhausted":
      return { $expr: { $gte: ["$usedQuota", "$totalQuota"] } };
    case "off":
      return { isActive: false };
    case "ended":
      return { endAt: { $lt: now } };
    default:
      return {};
  }
}

export function normalizeSearch(q: string | null | undefined): string {
  return (q ?? "").trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Search case-insensitive theo code hoặc title.
export function buildSearchFilter(q: string | null | undefined): Record<string, unknown> {
  const text = normalizeSearch(q);
  if (!text) return {};
  const rx = { $regex: escapeRegex(text), $options: "i" };
  return { $or: [{ code: rx }, { title: rx }] };
}

export function buildPublicSort(
  sort: string | null | undefined,
): Record<string, 1 | -1> {
  switch (sort) {
    case "newest":
      return { createdAt: -1 };
    case "bestValue":
      return { discountValue: -1, endAt: 1 };
    case "endingSoon":
    default:
      return { endAt: 1, createdAt: -1 };
  }
}

export function buildManagerSort(
  sort: string | null | undefined,
): Record<string, 1 | -1> {
  return sort === "endingSoon" ? { endAt: 1 } : { createdAt: -1 };
}

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export function paginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return { page, limit, total, totalPages, hasMore: page < totalPages };
}
