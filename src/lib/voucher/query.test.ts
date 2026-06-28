import { describe, expect, it } from "vitest";
import {
  buildManagerSort,
  buildPublicSort,
  buildSearchFilter,
  buildSlotFilter,
  buildStateFilter,
  normalizeSearch,
  paginationMeta,
  parsePagination,
} from "./query";

describe("parsePagination", () => {
  it("dùng default khi thiếu/không hợp lệ", () => {
    expect(parsePagination(null, null)).toEqual({ page: 1, limit: 24, skip: 0 });
    expect(parsePagination("abc", "xyz")).toEqual({ page: 1, limit: 24, skip: 0 });
    expect(parsePagination("0", "0")).toEqual({ page: 1, limit: 24, skip: 0 });
    expect(parsePagination("-3", "-3")).toEqual({ page: 1, limit: 24, skip: 0 });
  });

  it("clamp limit theo maxLimit và tính skip", () => {
    expect(parsePagination("2", "100")).toEqual({ page: 2, limit: 50, skip: 50 });
    expect(parsePagination("3", "10")).toEqual({ page: 3, limit: 10, skip: 20 });
  });

  it("tôn trọng option default/max tùy biến", () => {
    expect(parsePagination(null, null, { defaultLimit: 4, maxLimit: 8 })).toEqual({
      page: 1,
      limit: 4,
      skip: 0,
    });
    expect(parsePagination("1", "999", { defaultLimit: 4, maxLimit: 8 })).toEqual({
      page: 1,
      limit: 8,
      skip: 0,
    });
  });
});

describe("buildSlotFilter", () => {
  it("platform = sàn không freeship", () => {
    expect(buildSlotFilter("platform")).toEqual({
      vendor: null,
      discountType: { $ne: "freeship" },
    });
  });
  it("shop = có vendor, không freeship", () => {
    expect(buildSlotFilter("shop")).toEqual({
      vendor: { $ne: null },
      discountType: { $ne: "freeship" },
    });
  });
  it("freeship = discountType freeship", () => {
    expect(buildSlotFilter("freeship")).toEqual({ discountType: "freeship" });
  });
  it("all/unknown = không lọc", () => {
    expect(buildSlotFilter("all")).toEqual({});
    expect(buildSlotFilter(undefined)).toEqual({});
  });
});

describe("buildStateFilter", () => {
  const now = new Date("2026-06-15T00:00:00.000Z");

  it("running: đang bật, trong hạn, còn lượt", () => {
    expect(buildStateFilter("running", now)).toEqual({
      isActive: true,
      startAt: { $lte: now },
      endAt: { $gte: now },
      $expr: { $lt: ["$usedQuota", "$totalQuota"] },
    });
  });
  it("scheduled: bật nhưng chưa tới startAt", () => {
    expect(buildStateFilter("scheduled", now)).toEqual({
      isActive: true,
      startAt: { $gt: now },
    });
  });
  it("expiring: hết hạn trong 3 ngày", () => {
    const cutoff = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    expect(buildStateFilter("expiring", now)).toEqual({
      isActive: true,
      startAt: { $lte: now },
      endAt: { $gte: now, $lte: cutoff },
      $expr: { $lt: ["$usedQuota", "$totalQuota"] },
    });
  });
  it("exhausted/off/ended", () => {
    expect(buildStateFilter("exhausted", now)).toEqual({
      $expr: { $gte: ["$usedQuota", "$totalQuota"] },
    });
    expect(buildStateFilter("off", now)).toEqual({ isActive: false });
    expect(buildStateFilter("ended", now)).toEqual({ endAt: { $lt: now } });
  });
  it("all/unknown = không lọc", () => {
    expect(buildStateFilter("all", now)).toEqual({});
  });
});

describe("search", () => {
  it("normalize trim", () => {
    expect(normalizeSearch("  SALE  ")).toBe("SALE");
    expect(normalizeSearch(undefined)).toBe("");
  });
  it("filter case-insensitive theo code/title, escape regex", () => {
    expect(buildSearchFilter("")).toEqual({});
    expect(buildSearchFilter("sale")).toEqual({
      $or: [
        { code: { $regex: "sale", $options: "i" } },
        { title: { $regex: "sale", $options: "i" } },
      ],
    });
    // ký tự đặc biệt regex bị escape
    const f = buildSearchFilter("a+b") as {
      $or: { code: { $regex: string } }[];
    };
    expect(f.$or[0].code.$regex).toBe("a\\+b");
  });
});

describe("sort + paginationMeta", () => {
  it("public sort", () => {
    expect(buildPublicSort("newest")).toEqual({ createdAt: -1 });
    expect(buildPublicSort("bestValue")).toEqual({ discountValue: -1, endAt: 1 });
    expect(buildPublicSort("endingSoon")).toEqual({ endAt: 1, createdAt: -1 });
    expect(buildPublicSort(undefined)).toEqual({ endAt: 1, createdAt: -1 });
  });
  it("manager sort", () => {
    expect(buildManagerSort("endingSoon")).toEqual({ endAt: 1 });
    expect(buildManagerSort("newest")).toEqual({ createdAt: -1 });
    expect(buildManagerSort(undefined)).toEqual({ createdAt: -1 });
  });
  it("meta tính totalPages + hasMore", () => {
    expect(paginationMeta(50, 1, 24)).toEqual({
      page: 1,
      limit: 24,
      total: 50,
      totalPages: 3,
      hasMore: true,
    });
    expect(paginationMeta(50, 3, 24)).toEqual({
      page: 3,
      limit: 24,
      total: 50,
      totalPages: 3,
      hasMore: false,
    });
    expect(paginationMeta(0, 1, 24)).toEqual({
      page: 1,
      limit: 24,
      total: 0,
      totalPages: 0,
      hasMore: false,
    });
  });
});
