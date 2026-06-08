import crypto from "crypto";

const TMN_CODE = process.env.VNPAY_TMN_CODE ?? "";
const HASH_SECRET = process.env.VNPAY_HASH_SECRET ?? "";
const VNPAY_URL =
  process.env.VNPAY_URL ??
  "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
const RETURN_URL =
  process.env.VNPAY_RETURN_URL ?? "http://localhost:3000/orders";

// Mirrors VNPay's official sortObject: sort keys, URL-encode values with + for spaces.
// The signature is computed on the encoded representation, and the URL is built
// from the same encoded values so VNPay can verify them as-received.
function sortAndEncode(
  obj: Record<string, string>,
): { keys: string[]; encoded: Record<string, string> } {
  const keys = Object.keys(obj).sort();
  const encoded: Record<string, string> = {};
  for (const k of keys) {
    encoded[k] = encodeURIComponent(obj[k]).replace(/%20/g, "+");
  }
  return { keys, encoded };
}

// Format date as yyyyMMddHHmmss in GMT+7
function formatVnDate(date: Date): string {
  const gmt7 = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return gmt7.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
}

export function createVnpayUrl(params: {
  txnRef: string;
  amount: number;
  orderInfo: string;
  ipAddr: string;
  locale?: string;
}): string {
  const { txnRef, amount, orderInfo, ipAddr, locale = "vn" } = params;

  const now = new Date();
  const raw: Record<string, string> = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: TMN_CODE,
    vnp_Amount: String(amount * 100),
    vnp_CurrCode: "VND",
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: "other",
    vnp_Locale: locale,
    vnp_ReturnUrl: RETURN_URL,
    vnp_IpAddr: ipAddr,
    vnp_CreateDate: formatVnDate(now),
    vnp_ExpireDate: formatVnDate(new Date(now.getTime() + 15 * 60 * 1000)),
  };

  const { keys, encoded } = sortAndEncode(raw);

  // Sign over the encoded key=value pairs (VNPay convention)
  const signData = keys.map((k) => `${k}=${encoded[k]}`).join("&");
  const signed = crypto
    .createHmac("sha512", HASH_SECRET)
    .update(Buffer.from(signData, "utf-8"))
    .digest("hex");

  // Build URL with the same encoded values + SecureHash appended last
  const query = signData + `&vnp_SecureHash=${signed}`;

  return `${VNPAY_URL}?${query}`;
}

export interface VnpayIpnResult {
  isValid: boolean;
  responseCode: string;
  txnRef: string;
  transactionNo: string;
  bankCode: string;
  amount: number;
  orderInfo: string;
  payDate: string;
}

export function verifyVnpayReturn(
  query: Record<string, string>,
): VnpayIpnResult {
  const { vnp_SecureHash, vnp_SecureHashType, ...rest } = query;

  // Re-encode values the same way we did when creating the URL
  const { keys, encoded } = sortAndEncode(rest as Record<string, string>);
  const signData = keys.map((k) => `${k}=${encoded[k]}`).join("&");

  const signed = crypto
    .createHmac("sha512", HASH_SECRET)
    .update(Buffer.from(signData, "utf-8"))
    .digest("hex");

  return {
    isValid: signed === vnp_SecureHash,
    responseCode: rest.vnp_ResponseCode ?? "",
    txnRef: rest.vnp_TxnRef ?? "",
    transactionNo: rest.vnp_TransactionNo ?? "",
    bankCode: rest.vnp_BankCode ?? "",
    amount: parseInt(rest.vnp_Amount ?? "0") / 100,
    orderInfo: rest.vnp_OrderInfo ?? "",
    payDate: rest.vnp_PayDate ?? "",
  };
}
