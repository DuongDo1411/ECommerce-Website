// Nhãn tiếng Việt dùng CHUNG cho email + UI buyer/vendor/admin.
//
// Chỉ `import type` từ model (bị xoá lúc biên dịch) nên file này an toàn cho client
// component — không kéo mongoose vào bundle trình duyệt.

import type {
  ReturnReasonCode,
  ReturnStatus,
} from "@/model/returnRequest.model";

// Nhãn cho NGƯỜI MUA: nói theo việc họ cần làm hoặc đang chờ ai, không lộ thuật ngữ
// nội bộ của state machine.
export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  requested: "Chờ người bán duyệt",
  awaiting_return_shipment: "Đã duyệt — chờ gửi hàng",
  return_in_transit: "Đang chuyển hoàn",
  inspection_pending: "Người bán đang kiểm hàng",
  vendor_rejected: "Bị từ chối — có thể khiếu nại",
  escalated: "Đang chờ sàn phân xử",
  refund_pending: "Chờ hoàn tiền",
  refunded: "Đã hoàn tiền",
  refund_failed: "Hoàn tiền thất bại",
  resolved_no_refund: "Đã xử lý — không phát sinh hoàn tiền",
  closed_rejected: "Đã đóng — không được chấp nhận",
  cancelled_by_buyer: "Bạn đã huỷ yêu cầu",
  expired_unshipped: "Quá hạn gửi hàng — đã đóng",
};

// Màu badge theo "sức khoẻ" của case: good = xong tốt, bad = hỏng/bị từ chối,
// pending = đang chờ ai đó, active = đang chạy, closed = đã đóng.
export const RETURN_STATUS_TONE: Record<
  ReturnStatus,
  "pending" | "active" | "good" | "bad" | "closed"
> = {
  requested: "pending",
  awaiting_return_shipment: "active",
  return_in_transit: "active",
  inspection_pending: "active",
  vendor_rejected: "bad",
  escalated: "pending",
  refund_pending: "pending",
  refunded: "good",
  refund_failed: "bad",
  // Yêu cầu được chấp nhận, chỉ là không có tiền để hoàn → kết cục tốt, không phải lỗi.
  resolved_no_refund: "good",
  closed_rejected: "closed",
  cancelled_by_buyer: "closed",
  expired_unshipped: "closed",
};

export const RETURN_REASON_LABELS: Record<ReturnReasonCode, string> = {
  not_received: "Không nhận được hàng",
  missing_item: "Thiếu hàng trong kiện",
  wrong_item: "Giao sai sản phẩm",
  damaged: "Hàng bị hư hỏng khi nhận",
  defective: "Hàng lỗi, không dùng được",
  not_as_described: "Khác với mô tả",
  suspected_counterfeit: "Nghi ngờ hàng giả",
  changed_mind: "Đổi ý, không còn nhu cầu",
  other: "Lý do khác",
};

// Dùng để HIỂN THỊ kết luận (gồm cả "unknown" của dữ liệu cũ / phỏng đoán ban đầu).
export const FAULT_LABELS: Record<string, string> = {
  vendor: "Lỗi người bán",
  buyer: "Lỗi người mua",
  carrier: "Lỗi đơn vị vận chuyển",
  unknown: "Chưa xác định",
};

// Dùng cho form DUYỆT: không có "unknown". Kết luận này quyết định ai trả phí ship hoàn
// và có hoàn phí ship gốc không — chọn "chưa xác định" là chốt tiền mà chưa ai kết luận.
export const DECIDABLE_FAULT_LABELS: Record<string, string> = {
  vendor: "Lỗi người bán",
  buyer: "Lỗi người mua",
  carrier: "Lỗi đơn vị vận chuyển",
};

export const DISPOSITION_LABELS: Record<string, string> = {
  restock: "Nhập lại kho (bán tiếp được)",
  damaged: "Hỏng — không nhập kho",
  lost: "Thất lạc",
  quarantine: "Giữ riêng để kiểm tra",
};

export const SHIPPING_PAYER_LABELS: Record<string, string> = {
  vendor: "Người bán trả phí ship hoàn",
  buyer: "Người mua chịu phí ship hoàn (trừ vào tiền hoàn)",
  platform: "Sàn chịu phí ship hoàn",
};

// Nhãn cho các action trong history — hiển thị timeline cho cả 3 vai.
export const ACTION_LABELS: Record<string, string> = {
  create_request: "Gửi yêu cầu trả hàng",
  approve_return: "Duyệt trả hàng",
  approve_refund_only: "Duyệt hoàn tiền (không cần trả hàng)",
  approve_received_return: "Xác nhận hàng đã về, duyệt hoàn",
  reject: "Từ chối yêu cầu",
  resolve_no_refund: "Chấp nhận (không phát sinh hoàn tiền)",
  buyer_cancel: "Người mua huỷ yêu cầu",
  confirm_ready_for_pickup: "Người mua đã đóng gói, sẵn sàng bàn giao",
  submit_manual_shipment: "Người mua khai vận đơn tự gửi",
  carrier_pickup: "Đơn vị vận chuyển đã lấy hàng",
  mark_received: "Người bán xác nhận đã nhận hàng",
  delivered_to_vendor: "Hàng hoàn đã tới kho người bán",
  carrier_exception: "Sự cố vận chuyển",
  accept_inspection: "Kiểm định đạt",
  timeout_vendor_response: "Quá hạn người bán phản hồi → chuyển sàn",
  timeout_shipment: "Quá hạn gửi hàng → đóng yêu cầu",
  timeout_inspection: "Quá hạn kiểm định → chuyển sàn",
  timeout_appeal: "Quá hạn khiếu nại → đóng theo quyết định người bán",
  appeal: "Người mua khiếu nại lên sàn",
  accept_rejection: "Người mua chấp nhận từ chối",
  mark_processed: "Sàn xác nhận đã hoàn tiền",
  mark_failed: "Hoàn tiền thất bại",
  retry_refund: "Thử hoàn tiền lại",
  open_delivery_failure_case: "Mở hồ sơ do giao hàng thất bại",
};

export const HISTORY_ROLE_LABELS: Record<string, string> = {
  buyer: "Người mua",
  vendor: "Người bán",
  admin: "Sàn",
  system: "Hệ thống",
};

export function actionLabel(action?: string): string {
  return ACTION_LABELS[action ?? ""] ?? action ?? "—";
}

export function returnStatusLabel(status?: string): string {
  return RETURN_STATUS_LABELS[status as ReturnStatus] ?? status ?? "—";
}

export function returnReasonLabel(reason?: string): string {
  return RETURN_REASON_LABELS[reason as ReturnReasonCode] ?? reason ?? "—";
}
