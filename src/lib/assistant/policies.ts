// Nội dung chính sách tĩnh cho tool `get_ecoshop_policy`. Bám đúng nghiệp vụ đã cài đặt
// thật trong repo (không suy đoán, không hứa cơ chế chưa tồn tại) — đối chiếu:
//   payment  -> src/model/order.model.ts (paymentMethod: "cod"|"vnpay"), src/lib/vnpay.ts
//   shipping -> src/lib/ghn.ts (computeFeesByVendor tính phí riêng từng nhà bán)
//   returns  -> src/model/product.model.ts (replacementDays), src/lib/returns/**
//   vouchers -> src/model/voucher.model.ts (slot: "shop"|"platform"|"freeship")
//   support  -> hệ thống chat buyer-vendor (Conversation/Message) + chính trợ lý AI này

export type AssistantPolicyTopic =
  | "payment"
  | "shipping"
  | "returns"
  | "vouchers"
  | "support";

export const ASSISTANT_POLICY_TOPICS: AssistantPolicyTopic[] = [
  "payment",
  "shipping",
  "returns",
  "vouchers",
  "support",
];

export const ASSISTANT_POLICIES: Record<AssistantPolicyTopic, string> = {
  payment:
    "Ecoshop hỗ trợ hai hình thức thanh toán: thanh toán khi nhận hàng (COD) và thanh toán trực tuyến qua VNPay. COD chỉ khả dụng khi chính nhà bán của sản phẩm đó bật hỗ trợ COD — không phải sản phẩm nào cũng có COD, hệ thống sẽ báo rõ khi không hỗ trợ. Với VNPay, đơn được tạo ở trạng thái chờ và chỉ chuyển sang đã thanh toán sau khi VNPay xác nhận giao dịch thành công. Không có ví điện tử nội bộ.",
  shipping:
    "Vận chuyển do Giao Hàng Nhanh (GHN) đảm nhận. Phí vận chuyển được tính riêng cho từng nhà bán trong cùng một lượt đặt hàng, dựa trên tuyến giao và đặc điểm sản phẩm — không có một mức phí cố định chung cho toàn đơn. Một số sản phẩm được nhà bán bật miễn phí vận chuyển. Trợ lý không tự tính hộ số tiền phí ship cụ thể; số phí chính xác hiển thị ở trang giỏ hàng/thanh toán khi đã chọn địa chỉ giao.",
  returns:
    "Mỗi sản phẩm có một hạn đổi/trả riêng do nhà bán cấu hình (tính theo số ngày kể từ khi giao hàng thành công); không có một hạn đổi/trả chung áp dụng cho mọi sản phẩm, và một số sản phẩm có thể không hỗ trợ đổi/trả nếu nhà bán chưa cấu hình. Quy trình: người mua gửi yêu cầu kèm bằng chứng, nhà bán xét duyệt (chấp nhận, chỉ hoàn tiền, hoặc từ chối kèm lý do); nếu người mua không đồng ý với quyết định từ chối, có thể khiếu nại lên quản trị viên để phân xử. Số tiền hoàn luôn do hệ thống tự tính theo từng trường hợp cụ thể, trợ lý không tự đưa ra con số hoàn tiền.",
  vouchers:
    "Ecoshop có ba loại mã giảm giá: mã riêng của từng cửa hàng, mã áp dụng toàn sàn, và mã miễn phí vận chuyển. Khi một lượt mua hàng gồm nhiều nhà bán, phần giảm giá được phân bổ lại cho từng đơn con tương ứng. Người mua cần tự thu thập mã vào ví voucher trước khi mã đó có thể dùng khi thanh toán; không phải mã nào cũng áp dụng được cho mọi sản phẩm hay mọi cửa hàng.",
  support:
    "Người mua có thể nhắn tin trực tiếp với nhà bán của sản phẩm để hỏi thêm trước khi mua, thông qua khung chat trên trang sản phẩm/cửa hàng — tách biệt với trợ lý AI này. Trợ lý AI trả lời câu hỏi chung về sản phẩm và chính sách, không thay thế được việc trao đổi trực tiếp với nhà bán cho các câu hỏi riêng về một đơn hàng cụ thể ngoài phạm vi tra cứu đã hỗ trợ.",
};

export function getPolicyText(topic: string): string {
  if ((ASSISTANT_POLICY_TOPICS as string[]).includes(topic)) {
    return ASSISTANT_POLICIES[topic as AssistantPolicyTopic];
  }
  return "Chủ đề chính sách không xác định. Các chủ đề hỗ trợ: payment, shipping, returns, vouchers, support.";
}
