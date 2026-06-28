// GHN (Giao Hàng Nhanh) service layer.
// Specs verified against https://api.ghn.vn/home/docs/detail
//
// Two header conventions exist:
//  - master-data APIs (province/district/ward, available-services): lowercase `token`, no ShopId
//  - shipping-order APIs (create/fee/cancel/detail/print): `Token` + `ShopId`
// ghnMasterFetch / ghnOrderFetch encapsulate this difference.

import Product from "@/model/product.model";

const BASE_URL =
  process.env.GHN_BASE_URL ?? "https://dev-online-gateway.ghn.vn";
const TOKEN = process.env.GHN_API_TOKEN ?? "";
const SHOP_ID = process.env.GHN_SHOP_ID ?? "";

// required_note is fixed per business decision: buyer may see goods, not try them.
export const GHN_REQUIRED_NOTE = "CHOXEMHANGKHONGTHU";
// service_type_id 2 = E-commerce delivery.
export const GHN_SERVICE_TYPE_ECOMMERCE = 2;

export class GHNError extends Error {
  code: number;
  codeMessage?: string;
  constructor(message: string, code: number, codeMessage?: string) {
    super(message);
    this.name = "GHNError";
    this.code = code;
    this.codeMessage = codeMessage;
  }
}

interface GHNResponse<T> {
  code: number;
  message: string;
  data: T;
  code_message?: string;
}

async function ghnRequest<T>(
  path: string,
  headers: Record<string, string>,
  method: "GET" | "POST",
  body?: unknown,
): Promise<T> {
  if (!TOKEN) {
    throw new GHNError(
      "GHN chưa được cấu hình — thiếu GHN_API_TOKEN trong .env.local",
      500,
    );
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  let json: GHNResponse<T>;
  try {
    json = (await res.json()) as GHNResponse<T>;
  } catch {
    throw new GHNError(`GHN trả về phản hồi không hợp lệ (HTTP ${res.status})`, res.status);
  }

  if (json.code !== 200) {
    const msg = json.message ?? "Lỗi không xác định từ GHN";
    if (json.code === 401 || /token is not valid/i.test(msg)) {
      throw new GHNError(
        "GHN token không hợp lệ — kiểm tra GHN_API_TOKEN",
        401,
        json.code_message,
      );
    }
    throw new GHNError(msg, json.code, json.code_message);
  }
  return json.data;
}

function ghnMasterFetch<T>(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<T> {
  return ghnRequest<T>(path, { Token: TOKEN }, method, body);
}

function ghnOrderFetch<T>(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
  includeShopId = true,
): Promise<T> {
  const headers: Record<string, string> = { Token: TOKEN };
  if (includeShopId) headers.ShopId = SHOP_ID;
  return ghnRequest<T>(path, headers, method, body);
}

/* ----------------------------- Master data ----------------------------- */

export interface GHNProvince {
  ProvinceID: number;
  ProvinceName: string;
  Code: string;
}
export interface GHNDistrict {
  DistrictID: number;
  ProvinceID: number;
  DistrictName: string;
  SupportType: number;
}
export interface GHNWard {
  WardCode: string | number;
  DistrictID: number;
  WardName: string;
}

export function getProvinces(): Promise<GHNProvince[]> {
  return ghnMasterFetch<GHNProvince[]>(
    "/shiip/public-api/master-data/province",
    "GET",
  );
}

export function getDistricts(provinceId: number): Promise<GHNDistrict[]> {
  return ghnMasterFetch<GHNDistrict[]>(
    "/shiip/public-api/master-data/district",
    "POST",
    { province_id: provinceId },
  );
}

export async function getWards(districtId: number): Promise<GHNWard[]> {
  const wards = await ghnMasterFetch<GHNWard[]>(
    "/shiip/public-api/master-data/ward",
    "POST",
    { district_id: districtId },
  );
  // WardCode arrives as number; create-order needs it as string.
  return wards.map((w) => ({ ...w, WardCode: String(w.WardCode) }));
}

/* ------------------------------- Service ------------------------------- */

export interface GHNService {
  service_id: number;
  short_name: string;
  service_type_id: number;
}

export async function getAvailableServices(
  fromDistrictId: number,
  toDistrictId: number,
): Promise<GHNService[]> {
  return ghnOrderFetch<GHNService[]>(
    "/shiip/public-api/v2/shipping-order/available-services",
    "POST",
    {
      shop_id: Number(SHOP_ID),
      from_district: fromDistrictId,
      to_district: toDistrictId,
    },
    false, // shop_id is in body, no ShopId header needed
  );
}

// Prefer e-commerce (type 2), else first available; throw if route unsupported.
export async function pickServiceId(
  fromDistrictId: number,
  toDistrictId: number,
): Promise<number> {
  const services = await getAvailableServices(fromDistrictId, toDistrictId);
  if (!services || services.length === 0) {
    throw new GHNError(
      "Tuyến giao hàng không khả dụng (GHN không phục vụ khu vực này)",
      400,
    );
  }
  const ecommerce = services.find(
    (s) => s.service_type_id === GHN_SERVICE_TYPE_ECOMMERCE,
  );
  return (ecommerce ?? services[0]).service_id;
}

/* --------------------------------- Fee --------------------------------- */

export interface GHNFeeParams {
  serviceId: number;
  fromDistrictId: number;
  fromWardCode: string;
  toDistrictId: number;
  toWardCode: string;
  weight: number;
  length: number;
  width: number;
  height: number;
  insuranceValue?: number;
}

interface GHNFeeData {
  total: number;
  service_fee: number;
  insurance_fee: number;
}

export async function calculateShippingFee(
  p: GHNFeeParams,
): Promise<number> {
  const data = await ghnOrderFetch<GHNFeeData>(
    "/shiip/public-api/v2/shipping-order/fee",
    "POST",
    {
      service_id: p.serviceId,
      from_district_id: p.fromDistrictId,
      from_ward_code: p.fromWardCode,
      to_district_id: p.toDistrictId,
      to_ward_code: p.toWardCode,
      weight: p.weight,
      length: p.length,
      width: p.width,
      height: p.height,
      // GHN caps insurance at 5,000,000.
      insurance_value: Math.min(p.insuranceValue ?? 0, 5_000_000),
      coupon: null,
    },
  );
  return data.total;
}

export interface CheckoutAddressForGHN {
  districtId: number;
  wardCode: string;
}

export interface CheckoutItemForGHN {
  productId: string;
  quantity: number;
}

export interface FeeByVendor {
  vendorId: string;
  fee: number;
  serviceId: number;
  isFreeDelivery: boolean;
}

// Lean shapes for computeFeesByVendor's Product.find(...).populate("vendor").
// Only the fields the grouping/fee logic reads are declared.
interface VendorLean {
  _id: { toString(): string };
  shopName?: string;
  shopAddressDetail?: {
    districtId?: number;
    wardCode?: string;
  };
}

interface ProductLean {
  _id: { toString(): string };
  vendor: VendorLean;
  price: number;
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
  freeDelivery?: boolean;
}

export async function computeFeesByVendor(
  address: CheckoutAddressForGHN,
  items: CheckoutItemForGHN[],
): Promise<{ feesByVendor: FeeByVendor[]; totalFee: number }> {
  const productIds = items.map((i) => i.productId);
  const products = await Product.find({ _id: { $in: productIds } }).populate(
    "vendor",
    "shopAddressDetail shopName",
  );

  const byVendor = new Map<
    string,
    {
      vendor: VendorLean;
      weight: number;
      insurance: number;
      maxDim: number[];
      hasPaidDelivery: boolean;
    }
  >();

  for (const item of items) {
    const product = products.find(
      (p: ProductLean) => p._id.toString() === item.productId.toString(),
    );
    if (!product) continue;

    const vendor = product.vendor;
    const vendorId = vendor._id.toString();
    if (!byVendor.has(vendorId)) {
      byVendor.set(vendorId, {
        vendor,
        weight: 0,
        insurance: 0,
        maxDim: [0, 0, 0],
        hasPaidDelivery: false,
      });
    }

    const g = byVendor.get(vendorId)!;
    g.weight += (product.weight ?? 500) * item.quantity;
    g.insurance += product.price * item.quantity;
    g.maxDim = [
      Math.max(g.maxDim[0], product.length ?? 20),
      Math.max(g.maxDim[1], product.width ?? 15),
      Math.max(g.maxDim[2], product.height ?? 10),
    ];
    if (!product.freeDelivery) g.hasPaidDelivery = true;
  }

  const feesByVendor: FeeByVendor[] = [];
  for (const [vendorId, g] of byVendor) {
    if (!g.hasPaidDelivery) {
      feesByVendor.push({ vendorId, fee: 0, serviceId: 0, isFreeDelivery: true });
      continue;
    }

    const shop = g.vendor.shopAddressDetail;
    if (!shop?.districtId || !shop?.wardCode) {
      throw new GHNError(
        `Nguoi ban "${g.vendor.shopName ?? ""}" chua cau hinh dia chi kho GHN`,
        400,
      );
    }

    const serviceId = await pickServiceId(shop.districtId, address.districtId);
    const fee = await calculateShippingFee({
      serviceId,
      fromDistrictId: shop.districtId,
      fromWardCode: shop.wardCode,
      toDistrictId: address.districtId,
      toWardCode: address.wardCode,
      weight: g.weight,
      length: g.maxDim[0],
      width: g.maxDim[1],
      height: g.maxDim[2],
      insuranceValue: g.insurance,
    });
    feesByVendor.push({ vendorId, fee, serviceId, isFreeDelivery: false });
  }

  const totalFee = feesByVendor.reduce((sum, vendor) => sum + vendor.fee, 0);
  return { feesByVendor, totalFee };
}

/* ---------------------------- Create order ----------------------------- */

export interface GHNCreateOrderParams {
  // receiver (buyer) — uses id/code
  toName: string;
  toPhone: string;
  toAddress: string;
  toWardCode: string;
  toDistrictId: number;
  // sender (vendor) — uses names
  fromName: string;
  fromPhone: string;
  fromAddress: string;
  fromWardName: string;
  fromDistrictName: string;
  fromProvinceName: string;
  // parcel
  weight: number;
  length: number;
  width: number;
  height: number;
  serviceId: number;
  codAmount: number; // 0 when prepaid (stripe)
  insuranceValue: number;
  content: string;
  clientOrderCode: string; // = order._id, for reconciliation
  items: { name: string; quantity: number; weight: number; price?: number }[];
}

export interface GHNCreateOrderResult {
  order_code: string;
  sort_code: string;
  total_fee: string;
  expected_delivery_time: string;
}

export function createGHNOrder(
  p: GHNCreateOrderParams,
): Promise<GHNCreateOrderResult> {
  return ghnOrderFetch<GHNCreateOrderResult>(
    "/shiip/public-api/v2/shipping-order/create",
    "POST",
    {
      payment_type_id: 2, // buyer pays shipping fee (business decision)
      required_note: GHN_REQUIRED_NOTE,
      service_type_id: GHN_SERVICE_TYPE_ECOMMERCE,
      service_id: p.serviceId,
      client_order_code: p.clientOrderCode,
      to_name: p.toName,
      to_phone: p.toPhone,
      to_address: p.toAddress,
      to_ward_code: p.toWardCode,
      to_district_id: p.toDistrictId,
      from_name: p.fromName,
      from_phone: p.fromPhone,
      from_address: p.fromAddress,
      from_ward_name: p.fromWardName,
      from_district_name: p.fromDistrictName,
      from_province_name: p.fromProvinceName,
      cod_amount: p.codAmount,
      insurance_value: Math.min(p.insuranceValue, 5_000_000),
      content: p.content,
      weight: p.weight,
      length: p.length,
      width: p.width,
      height: p.height,
      coupon: null,
      items: p.items.map((it) => ({
        name: it.name,
        quantity: it.quantity,
        weight: it.weight,
        price: it.price,
      })),
    },
  );
}

/* ---------------------------- Cancel order ----------------------------- */

interface GHNCancelResult {
  order_code: string;
  result: boolean;
  message: string;
}

// Returns false (without throwing) when GHN refuses (e.g. already picked up),
// so caller can still cancel internally.
export async function cancelGHNOrder(orderCode: string): Promise<boolean> {
  try {
    const data = await ghnOrderFetch<GHNCancelResult[]>(
      "/shiip/public-api/v2/switch-status/cancel",
      "POST",
      { order_codes: [orderCode] },
    );
    return data?.[0]?.result === true;
  } catch (err) {
    console.error("[GHN] cancel failed:", (err as Error).message);
    return false;
  }
}

/* ----------------------------- Order info ------------------------------ */

export interface GHNOrderDetail {
  order_code: string;
  status: string;
  leadtime: string;
  finish_date: string | null;
  cod_amount: number;
  is_cod_collected: boolean;
  log: { status: string; updated_date: string }[];
}

export async function getGHNOrderDetail(
  orderCode: string,
): Promise<GHNOrderDetail> {
  const data = await ghnOrderFetch<GHNOrderDetail[]>(
    "/shiip/public-api/v2/shipping-order/detail",
    "POST",
    { order_code: orderCode },
    false,
  );
  return data[0];
}

/* ------------------------------- Print --------------------------------- */

// gen-token is short-lived (~30 min) so always regenerate.
export async function getPrintUrl(
  orderCode: string,
  size: "A5" | "80x80" | "52x70" = "A5",
): Promise<string> {
  const data = await ghnOrderFetch<{ token: string }>(
    "/shiip/public-api/v2/a5/gen-token",
    "POST",
    { order_codes: [orderCode] },
    false,
  );
  const sizePath =
    size === "A5" ? "printA5" : size === "80x80" ? "print80x80" : "print52x70";
  return `${BASE_URL}/a5/public-api/${sizePath}?token=${data.token}`;
}

/* --------------------------- Status mapping ---------------------------- */

const STATUS_VI: Record<string, string> = {
  ready_to_pick: "Chờ lấy hàng",
  picking: "Shipper đang đến lấy hàng",
  money_collect_picking: "Đang làm việc với người gửi",
  picked: "Đã lấy hàng",
  storing: "Đã nhập kho phân loại",
  transporting: "Đang luân chuyển hàng",
  sorting: "Đang phân loại tại kho",
  delivering: "Đang giao hàng",
  money_collect_delivering: "Đang làm việc với người nhận",
  delivered: "Giao thành công",
  delivery_fail: "Giao thất bại",
  waiting_to_return: "Chờ giao lại",
  return: "Chờ trả hàng về người bán",
  return_transporting: "Đang luân chuyển hàng hoàn",
  return_sorting: "Đang phân loại hàng hoàn",
  returning: "Đang hoàn hàng về người bán",
  return_fail: "Hoàn hàng thất bại",
  returned: "Đã hoàn hàng về người bán",
  cancel: "Đơn đã hủy",
  exception: "Đơn ngoại lệ (cần xử lý)",
  damage: "Hàng hư hỏng",
  lost: "Hàng thất lạc",
};

export function mapGhnStatusToVietnamese(status: string): string {
  return STATUS_VI[status] ?? `${status} (đang cập nhật)`;
}

// Maps a GHN status to our internal order.orderStatus, or null to keep "shipped".
export function mapGhnStatusToOrderStatus(
  status: string,
): "delivered" | "cancelled" | "returned" | null {
  if (status === "delivered") return "delivered";
  if (status === "cancel") return "cancelled";
  if (["returned", "return_fail", "lost", "damage"].includes(status))
    return "returned";
  return null;
}
