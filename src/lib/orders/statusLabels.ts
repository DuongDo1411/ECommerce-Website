// Nhãn trạng thái đơn hàng tiếng Việt phía người mua — dùng chung giữa trang
// `src/app/orders/page.tsx` (STATUS_CONFIG) và trợ lý AI (`src/lib/assistant/**`),
// để trợ lý không tạo ra một biến thể thuật ngữ thứ ba khác với những gì buyer đã
// thấy trên giao diện (đã có lệch buyer/vendor được ghi nhận ở YCPCN-17, không
// thêm lệch buyer/AI). Đặt ở src/lib/orders/ vì đây là khái niệm của đơn hàng,
// không riêng gì trợ lý AI.

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Đang chờ",
  confirmed: "Đã xác nhận",
  shipped: "Đang vận chuyển",
  delivered: "Đã giao",
  returned: "Đã trả hàng",
  delivery_exception: "Giao không thành công",
  cancelled: "Đã hủy",
};

export function getOrderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}
