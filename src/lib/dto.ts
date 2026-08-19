type UnknownRecord = Record<string, unknown>;

export type ClientRole = "user" | "vendor" | "admin";

export interface NavUserDTO {
  _id?: string;
  id?: string;
  name: string;
  image?: string;
  role: ClientRole;
}

export interface CurrentUserDTO extends NavUserDTO {
  _id: string;
  email: string;
  phone: string;
  gender?: "male" | "female";
  addresses: Array<{
    _id: string;
    label?: string;
    fullName: string;
    phone: string;
    provinceId: number;
    provinceName: string;
    districtId: number;
    districtName: string;
    wardCode: string;
    wardName: string;
    addressDetail: string;
    isDefault: boolean;
  }>;
  cart: Array<{ product: string; quantity: number; size?: string }>;
  shopName?: string;
  shopAddress?: string;
  shopAddressDetail?: UnknownRecord;
  shopBackground?: string;
  taxNumber?: string;
  isApproved: boolean;
  verificationStatus: "draft" | "pending" | "approved" | "rejected";
  rejectedReason?: string;
  twoFactorEnabled: boolean;
  hasPassword: boolean;
}

export interface PublicVendorDTO {
  _id: string;
  name: string;
  shopName: string;
  image?: string;
}

export interface PublicReviewDTO {
  _id: string;
  user: { name: string; image?: string };
  rating: number;
  comment?: string;
  image?: string;
  createdAt?: string;
}

export interface PublicProductDTO {
  _id: string;
  title: string;
  description: string;
  price: number;
  stock: number;
  isStockAvailable: boolean;
  image1: string;
  image2: string;
  image3: string;
  image4: string;
  category: string;
  isWearable: boolean;
  size: string[];
  sizeStock: Array<{ size: string; stock: number }>;
  replacementDays: number;
  freeDelivery: boolean;
  warranty: string;
  payOnDelivery: boolean;
  detailsPoints: string[];
  vendor: PublicVendorDTO | null;
  reviews: PublicReviewDTO[];
}

export interface ModeratedProductDTO extends PublicProductDTO {
  verificationStatus: "pending" | "approved" | "rejected";
  requestedAt?: string;
  approvedAt?: string;
  rejectedReason?: string;
  isActive: boolean;
  weight: number;
  length: number;
  width: number;
  height: number;
}

export interface PublicShopDTO extends PublicVendorDTO {
  shopBackground?: string;
  vendorReviews: PublicReviewDTO[];
}

function asRecord(value: unknown): UnknownRecord {
  if (value && typeof value === "object") return value as UnknownRecord;
  return {};
}

function idOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  const item = asRecord(value);
  if (item._id && item._id !== value) return idOf(item._id);
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { toString?: unknown }).toString === "function"
  ) {
    const result = (value as { toString(): string }).toString();
    return result === "[object Object]" ? "" : result;
  }
  return "";
}

const stringOf = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;
const numberOf = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const booleanOf = (value: unknown, fallback = false) =>
  typeof value === "boolean" ? value : fallback;
const dateOf = (value: unknown): string | undefined => {
  if (!value) return undefined;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

function roleOf(value: unknown): ClientRole {
  return value === "vendor" || value === "admin" ? value : "user";
}

export function toNavUserDTO(value: unknown): NavUserDTO {
  const user = asRecord(value);
  const image = stringOf(user.image);
  return {
    _id: idOf(user._id),
    name: stringOf(user.name),
    ...(image ? { image } : {}),
    role: roleOf(user.role),
  };
}

export function toCurrentUserDTO(
  value: unknown,
  hasPassword: boolean,
): CurrentUserDTO {
  const user = asRecord(value);
  const nav = toNavUserDTO(user);
  const gender = user.gender === "male" || user.gender === "female"
    ? user.gender
    : undefined;
  // "draft" phải đi qua nguyên vẹn. Quy nó về "pending" nghĩa là một nhà bán vừa kích hoạt,
  // chưa khai hồ sơ nào, lại hiện ra như đang chờ quản trị viên duyệt: giao diện mời họ ngồi
  // đợi một hồ sơ không tồn tại, còn quản trị viên thấy một mục rỗng trong hàng chờ.
  const verificationStatus =
    user.verificationStatus === "draft" ||
    user.verificationStatus === "approved" ||
    user.verificationStatus === "rejected"
      ? user.verificationStatus
      : "pending";

  return {
    ...nav,
    _id: nav._id ?? "",
    email: stringOf(user.email),
    phone: stringOf(user.phone),
    ...(gender ? { gender } : {}),
    addresses: Array.isArray(user.addresses)
      ? user.addresses.map((entry) => {
          const address = asRecord(entry);
          const label = stringOf(address.label);
          return {
            _id: idOf(address._id),
            ...(label ? { label } : {}),
            fullName: stringOf(address.fullName),
            phone: stringOf(address.phone),
            provinceId: numberOf(address.provinceId),
            provinceName: stringOf(address.provinceName),
            districtId: numberOf(address.districtId),
            districtName: stringOf(address.districtName),
            wardCode: stringOf(address.wardCode),
            wardName: stringOf(address.wardName),
            addressDetail: stringOf(address.addressDetail),
            isDefault: booleanOf(address.isDefault),
          };
        })
      : [],
    cart: Array.isArray(user.cart)
      ? user.cart.map((entry) => {
          const cart = asRecord(entry);
          const size = stringOf(cart.size);
          return {
            product: idOf(cart.product),
            quantity: numberOf(cart.quantity, 1),
            ...(size ? { size } : {}),
          };
        })
      : [],
    ...optionalString("shopName", user.shopName),
    ...optionalString("shopAddress", user.shopAddress),
    ...(user.shopAddressDetail
      ? { shopAddressDetail: sanitizeAddressDetail(user.shopAddressDetail) }
      : {}),
    ...optionalString("shopBackground", user.shopBackground),
    ...optionalString("taxNumber", user.taxNumber),
    isApproved: booleanOf(user.isApproved),
    verificationStatus,
    ...optionalString("rejectedReason", user.rejectedReason),
    twoFactorEnabled: booleanOf(user.twoFactorEnabled),
    hasPassword,
  };
}

function optionalString<Key extends string>(key: Key, value: unknown) {
  const parsed = stringOf(value);
  return parsed ? ({ [key]: parsed } as Record<Key, string>) : {};
}

function sanitizeAddressDetail(value: unknown): UnknownRecord {
  const address = asRecord(value);
  return {
    address: stringOf(address.address),
    wardCode: stringOf(address.wardCode),
    wardName: stringOf(address.wardName),
    districtId: numberOf(address.districtId),
    districtName: stringOf(address.districtName),
    provinceId: numberOf(address.provinceId),
    provinceName: stringOf(address.provinceName),
  };
}

export function toPublicVendorDTO(value: unknown): PublicVendorDTO | null {
  const vendor = asRecord(value);
  const id = idOf(vendor._id ?? value);
  if (!id || (!vendor.name && !vendor.shopName)) return null;
  const image = stringOf(vendor.image);
  return {
    _id: id,
    name: stringOf(vendor.name),
    shopName: stringOf(vendor.shopName),
    ...(image ? { image } : {}),
  };
}

function toPublicReviewDTO(value: unknown): PublicReviewDTO {
  const review = asRecord(value);
  const rawUser = asRecord(review.user);
  const userName = stringOf(rawUser.name);
  const userImage = stringOf(rawUser.image);
  const comment = stringOf(review.comment);
  const image = stringOf(review.image);
  const createdAt = dateOf(review.createdAt);

  return {
    _id: idOf(review._id),
    user: {
      name: userName,
      ...(userImage ? { image: userImage } : {}),
    },
    rating: numberOf(review.rating),
    ...(comment ? { comment } : {}),
    ...(image ? { image } : {}),
    ...(createdAt ? { createdAt } : {}),
  };
}

export function toPublicProductDTO(value: unknown): PublicProductDTO {
  const product = asRecord(value);
  return {
    _id: idOf(product._id),
    title: stringOf(product.title),
    description: stringOf(product.description),
    price: numberOf(product.price),
    stock: numberOf(product.stock),
    isStockAvailable: booleanOf(product.isStockAvailable, true),
    image1: stringOf(product.image1),
    image2: stringOf(product.image2),
    image3: stringOf(product.image3),
    image4: stringOf(product.image4),
    category: stringOf(product.category),
    isWearable: booleanOf(product.isWearable),
    size: Array.isArray(product.size)
      ? product.size.filter((item): item is string => typeof item === "string")
      : [],
    sizeStock: Array.isArray(product.sizeStock)
      ? product.sizeStock.map((entry) => {
          const size = asRecord(entry);
          return {
            size: stringOf(size.size),
            stock: numberOf(size.stock),
          };
        })
      : [],
    replacementDays: numberOf(product.replacementDays),
    freeDelivery: booleanOf(product.freeDelivery),
    warranty: stringOf(product.warranty, "No warranty"),
    payOnDelivery: booleanOf(product.payOnDelivery),
    detailsPoints: Array.isArray(product.detailsPoints)
      ? product.detailsPoints.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    vendor: toPublicVendorDTO(product.vendor),
    reviews: Array.isArray(product.reviews)
      ? product.reviews.map(toPublicReviewDTO)
      : [],
  };
}

export function toModeratedProductDTO(value: unknown): ModeratedProductDTO {
  const product = asRecord(value);
  const verificationStatus =
    product.verificationStatus === "approved" ||
    product.verificationStatus === "rejected"
      ? product.verificationStatus
      : "pending";
  return {
    ...toPublicProductDTO(product),
    verificationStatus,
    ...optionalDate("requestedAt", product.requestedAt),
    ...optionalDate("approvedAt", product.approvedAt),
    ...optionalString("rejectedReason", product.rejectedReason),
    isActive: booleanOf(product.isActive, true),
    weight: numberOf(product.weight, 500),
    length: numberOf(product.length, 20),
    width: numberOf(product.width, 15),
    height: numberOf(product.height, 10),
  };
}

function optionalDate<Key extends string>(key: Key, value: unknown) {
  const parsed = dateOf(value);
  return parsed ? ({ [key]: parsed } as Record<Key, string>) : {};
}

export function toPublicShopDTO(value: unknown): PublicShopDTO {
  const vendor = asRecord(value);
  const base = toPublicVendorDTO(vendor) ?? {
    _id: idOf(vendor._id),
    name: stringOf(vendor.name),
    shopName: stringOf(vendor.shopName),
  };
  return {
    ...base,
    ...optionalString("shopBackground", vendor.shopBackground),
    vendorReviews: Array.isArray(vendor.vendorReviews)
      ? vendor.vendorReviews.map(toPublicReviewDTO)
      : [],
  };
}
