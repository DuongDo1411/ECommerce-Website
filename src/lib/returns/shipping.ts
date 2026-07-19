// Vận đơn GHN CHIỀU NGƯỢC (người mua → kho vendor).
//
// Chiều xuôi: vendor gửi, buyer nhận. Chiều ngược đảo lại — buyer thành NGƯỜI GỬI,
// vendor thành NGƯỜI NHẬN. GHN đòi hai kiểu dữ liệu khác nhau cho hai đầu: người gửi
// khai bằng TÊN (from_ward_name/district_name/province_name), người nhận khai bằng MÃ
// (to_ward_code/to_district_id). Vì vậy không thể chỉ hoán đổi field cho nhau.

import {
  cancelGHNOrder,
  createGHNOrder,
  getGHNOrderDetailByClientCode,
  GHNError,
  pickServiceId,
} from "@/lib/ghn";
import Order from "@/model/order.model";
import ReturnRequest, {
  type IReturnAddressSnapshot,
} from "@/model/returnRequest.model";
import User from "@/model/user.model";

// client_order_code là khóa idempotent phía GHN: cùng một case luôn sinh cùng một mã,
// nên lần tạo thứ hai bị GHN từ chối thay vì đẻ ra vận đơn trùng.
export const RETURN_CLIENT_CODE_PREFIX = "RET-";

export function returnClientOrderCode(returnRequestId: unknown): string {
  return `${RETURN_CLIENT_CODE_PREFIX}${String(returnRequestId)}`;
}

// "RET-<id>" → "<id>"; null nếu không phải mã chiều ngược (⇒ là đơn xuôi).
export function parseReturnClientCode(code?: string | null): string | null {
  if (!code || !code.startsWith(RETURN_CLIENT_CODE_PREFIX)) return null;
  return code.slice(RETURN_CLIENT_CODE_PREFIX.length) || null;
}

export type EnsureShipmentResult =
  | { ok: true; orderCode: string; alreadyExisted: boolean }
  | { ok: false; error: string; retryable: boolean };

interface ProductDims {
  title?: string;
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
}

// GHN payment_type_id: 1 = người gửi trả (thực chất tính vào tài khoản shop GHN của
// sàn), 2 = người nhận trả khi nhận hàng.
//
// payer "vendor"   → 2: vendor trả khi nhận kiện hàng hoàn.
// payer "platform" → 1: sàn chịu (lỗi carrier) — tính vào tài khoản GHN của sàn.
// payer "buyer"    → 1: GHN không thu được của người gửi trong mô hình này, nên sàn ứng
//                       trước rồi TRỪ VÀO TIỀN HOÀN của buyer
//                       (refund.returnShippingDeduction).
function paymentTypeForPayer(payer?: string): number {
  return payer === "vendor" ? 2 : 1;
}

function snapshotFromOrderAddress(addr: {
  name?: string;
  phone?: string;
  address?: string;
  addressDetail?: string;
  wardCode?: string;
  wardName?: string;
  districtId?: number;
  districtName?: string;
  provinceId?: number;
  provinceName?: string;
}): IReturnAddressSnapshot {
  return {
    name: addr.name,
    phone: addr.phone,
    address: addr.addressDetail || addr.address,
    wardCode: addr.wardCode,
    wardName: addr.wardName,
    districtId: addr.districtId,
    districtName: addr.districtName,
    provinceId: addr.provinceId,
    provinceName: addr.provinceName,
  };
}

async function markCreationFailed(returnRequestId: unknown, reason: string) {
  await ReturnRequest.updateOne(
    { _id: returnRequestId, status: "awaiting_return_shipment" },
    {
      $set: { "shipping.status": "creation_failed" },
      $push: {
        "shipping.statusLog": {
          status: `creation_failed: ${reason}`,
          time: new Date(),
        },
      },
    },
  );
}

/**
 * Tạo vận đơn GHN chiều ngược cho một case — IDEMPOTENT: gọi lại bao nhiêu lần cũng chỉ
 * ra một vận đơn. KHÔNG tự đổi status của case: hàng chỉ được coi là "đang chuyển hoàn"
 * khi GHN báo đã lấy hàng thật.
 */
export async function ensureReturnShipment(
  returnRequestId: unknown,
): Promise<EnsureShipmentResult> {
  const doc = await ReturnRequest.findById(returnRequestId);
  if (!doc) {
    return { ok: false, error: "Không tìm thấy yêu cầu", retryable: false };
  }

  // Đã có vận đơn → không tạo nữa.
  if (doc.shipping?.ghn?.orderCode) {
    return {
      ok: true,
      orderCode: doc.shipping.ghn.orderCode,
      alreadyExisted: true,
    };
  }
  if (doc.status !== "awaiting_return_shipment") {
    return {
      ok: false,
      error: "Yêu cầu không ở trạng thái chờ gửi hàng",
      retryable: false,
    };
  }

  const order = await Order.findById(doc.order).populate(
    "products.product",
    "title weight length width height price",
  );
  if (!order) {
    await markCreationFailed(doc._id, "order_not_found");
    return { ok: false, error: "Không tìm thấy đơn hàng", retryable: false };
  }

  const vendor = await User.findById(doc.vendor).select(
    "shopName phone shopAddressDetail",
  );
  const shop = vendor?.shopAddressDetail;

  // Người gửi = buyer: GHN cần TÊN phường/quận/tỉnh (+ districtId để chọn tuyến).
  const addr = order.address ?? {};
  if (
    !addr.wardName ||
    !addr.districtName ||
    !addr.provinceName ||
    !addr.districtId
  ) {
    await markCreationFailed(doc._id, "buyer_address_incomplete");
    return {
      ok: false,
      error:
        "Địa chỉ người mua thiếu dữ liệu GHN (phường/quận/tỉnh) — không tạo được vận đơn hoàn",
      retryable: false,
    };
  }
  // Người nhận = vendor: GHN cần MÃ phường + ID quận.
  if (!shop?.districtId || !shop?.wardCode) {
    await markCreationFailed(doc._id, "vendor_address_incomplete");
    return {
      ok: false,
      error: "Người bán chưa cấu hình địa chỉ kho GHN",
      retryable: false,
    };
  }

  let totalWeight = 0;
  let maxL = 0;
  let maxW = 0;
  let maxH = 0;
  let insurance = 0;
  const items = (order.products ?? []).map(
    (p: { product?: ProductDims; quantity: number; price?: number }) => {
      const prod = p.product ?? {};
      const w = prod.weight ?? 500;
      totalWeight += w * p.quantity;
      maxL = Math.max(maxL, prod.length ?? 20);
      maxW = Math.max(maxW, prod.width ?? 15);
      maxH = Math.max(maxH, prod.height ?? 10);
      insurance += (p.price ?? 0) * p.quantity;
      return {
        name: prod.title ?? "Sản phẩm hoàn",
        quantity: p.quantity,
        weight: w,
        price: p.price,
      };
    },
  );

  const clientOrderCode = returnClientOrderCode(doc._id);
  const from = snapshotFromOrderAddress(addr);
  const to: IReturnAddressSnapshot = {
    name: vendor?.shopName ?? "Shop",
    phone: vendor?.phone ?? "0000000000",
    address: shop.address,
    wardCode: shop.wardCode,
    wardName: shop.wardName,
    districtId: shop.districtId,
    districtName: shop.districtName,
    provinceId: shop.provinceId,
    provinceName: shop.provinceName,
  };

  let result: {
    order_code: string;
    sort_code: string;
    total_fee: string;
    expected_delivery_time: string;
  };
  try {
    // Tuyến ngược: từ quận của buyer về quận của shop.
    const serviceId = await pickServiceId(addr.districtId, shop.districtId);
    result = await createGHNOrder({
      // Người nhận = vendor (theo MÃ)
      toName: to.name ?? "Shop",
      toPhone: to.phone ?? "0000000000",
      toAddress: to.address ?? "",
      toWardCode: String(shop.wardCode),
      toDistrictId: shop.districtId,
      // Người gửi = buyer (theo TÊN)
      fromName: from.name ?? "Người mua",
      fromPhone: from.phone ?? "0000000000",
      fromAddress: from.address ?? "",
      fromWardName: addr.wardName,
      fromDistrictName: addr.districtName,
      fromProvinceName: addr.provinceName,
      weight: totalWeight,
      length: maxL,
      width: maxW,
      height: maxH,
      serviceId,
      codAmount: 0, // hàng hoàn không thu hộ
      insuranceValue: insurance,
      content: `Hoàn hàng đơn ${String(order._id)}`,
      clientOrderCode,
      items,
      paymentTypeId: paymentTypeForPayer(doc.shipping?.payer),
    });
  } catch (err) {
    // Vận đơn có thể ĐÃ tạo thành công ở lần trước nhưng chưa kịp lưu (crash/timeout),
    // khi đó GHN từ chối vì trùng client_order_code. Nhận lại vận đơn cũ thay vì kẹt
    // vĩnh viễn ở creation_failed.
    const existing = await getGHNOrderDetailByClientCode(clientOrderCode).catch(
      () => null,
    );
    if (existing?.order_code) {
      result = {
        order_code: existing.order_code,
        sort_code: "",
        total_fee: "0",
        expected_delivery_time: existing.leadtime,
      };
    } else {
      const message = err instanceof GHNError ? err.message : String(err);
      await markCreationFailed(doc._id, message);
      return { ok: false, error: message, retryable: true };
    }
  }

  const fee = Number(result.total_fee ?? 0) || 0;
  const expected = result.expected_delivery_time
    ? new Date(result.expected_delivery_time)
    : undefined;

  // CAS: chỉ ghi nếu vẫn chưa có vận đơn — hai lần gọi song song thì chỉ một lần ghi.
  const saved = await ReturnRequest.findOneAndUpdate(
    {
      _id: doc._id,
      status: "awaiting_return_shipment",
      "shipping.ghn.orderCode": { $exists: false },
    },
    {
      $set: {
        "shipping.mode": "ghn",
        "shipping.carrier": "GHN",
        "shipping.trackingCode": result.order_code,
        "shipping.ghn.orderCode": result.order_code,
        "shipping.ghn.sortCode": result.sort_code,
        "shipping.ghn.fee": fee,
        ...(expected && !isNaN(expected.getTime())
          ? { "shipping.ghn.expectedDeliveryTime": expected }
          : {}),
        "shipping.from": from,
        "shipping.to": to,
        "shipping.status": "ready_to_pick",
      },
      $push: {
        "shipping.statusLog": { status: "ready_to_pick", time: new Date() },
      },
    },
    { returnDocument: "after" },
  );

  if (!saved) {
    // Ai đó vừa ghi trước — dùng vận đơn của họ.
    const fresh = await ReturnRequest.findById(doc._id).select(
      "shipping.ghn.orderCode",
    );
    const code = fresh?.shipping?.ghn?.orderCode;
    if (code) return { ok: true, orderCode: code, alreadyExisted: true };
    await cancelGHNOrder(result.order_code);
    return {
      ok: false,
      error: "Yêu cầu đã đổi trạng thái trong lúc tạo vận đơn",
      retryable: false,
    };
  }

  return { ok: true, orderCode: result.order_code, alreadyExisted: false };
}
