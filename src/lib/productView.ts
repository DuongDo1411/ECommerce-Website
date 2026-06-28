// Shared display-shape types and safe accessors for the customer-facing
// product / shop / review views. Pure types + guards only (no model imports),
// so this module is safe to import from both client components and route
// handlers. Shapes are intentionally loose ("*Like") because the same data
// arrives either as a Mongoose document, a lean object, or serialized JSON.

/** A vendor as referenced from a product or shop view. */
export type ProductVendorLike = {
  _id?: string | { toString(): string };
  id?: string;
  name?: string;
  shopName?: string;
  image?: string;
  shopBackground?: string;
};

/** A single review on a product or shop. `user` may be an id or populated. */
export type ProductReviewLike = {
  _id?: string | { toString(): string };
  user?:
    | string
    | {
        _id?: string | { toString(): string };
        name?: string;
        image?: string;
        toString?: () => string;
      };
  rating: number;
  comment?: string;
  image?: string;
  createdAt?: string | Date;
};

/** Minimal product fields the customer cards / lists read. */
export type ProductCardLike = {
  _id: string | { toString(): string };
  title: string;
  price: number;
  image1?: string;
  stock?: number;
  isStockAvailable?: boolean;
  isActive?: boolean;
  verificationStatus?: "pending" | "approved" | "rejected";
  category?: string;
  vendor?: ProductVendorLike;
  reviews?: ProductReviewLike[];
};

/** A public voucher as returned by /api/vouchers (shop & PDP suggestion lists). */
export type PublicVoucher = {
  _id: string;
  code: string;
  title: string;
  description?: string;
  discountType: "fixed" | "percentage" | "freeship";
  discountValue: number;
  maxDiscount?: number;
  minSpend?: number;
  endAt?: string;
  collected?: boolean;
};

/** A populated user as embedded in a serialized review. */
export type PopulatedUser = {
  _id?: unknown;
  name?: string;
  image?: string;
};

/**
 * Normalize any id-ish value (string, ObjectId, or other object exposing
 * toString) to a plain string. Returns "" for null/undefined.
 */
export function toId(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const record = value as {
      _id?: unknown;
      id?: unknown;
      toString?: () => string;
    };

    if (typeof record._id === "string") return record._id;
    if (record._id && record._id !== value) {
      const nestedId = toId(record._id);
      if (nestedId) return nestedId;
    }

    if (typeof record.id === "string") return record.id;
    if (record.id && record.id !== value) {
      const nestedId = toId(record.id);
      if (nestedId) return nestedId;
    }

    if (
      typeof record.toString === "function" &&
      record.toString !== Object.prototype.toString
    ) {
      const stringValue = record.toString();
      if (stringValue && stringValue !== "[object Object]") return stringValue;
    }
  }
  return "";
}

/**
 * Safely read the populated user off a review's `user` field. When the field is
 * still just an id (not populated), name/image come back undefined — matching
 * the previous `(review.user as any)?.name` behavior without using `any`.
 */
export function getPopulatedUser(user: unknown): PopulatedUser {
  if (user && typeof user === "object") {
    const u = user as { _id?: unknown; name?: unknown; image?: unknown };
    return {
      _id: u._id,
      name: typeof u.name === "string" ? u.name : undefined,
      image: typeof u.image === "string" ? u.image : undefined,
    };
  }
  return {};
}
