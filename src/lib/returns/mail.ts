// Email thông báo cho case hoàn trả.
//
// BEST-EFFORT: gọi SAU khi dữ liệu đã ghi xong, và KHÔNG BAO GIỜ ném lỗi ra ngoài.
// Hộp mail đầy hay Gmail chặn cũng không được phép làm hỏng một quyết định đã chốt —
// mất mail thì gửi lại được, còn rollback một case đã duyệt thì không.

import { sendMail } from "@/lib/mailer";
import "@/model/user.model";
import ReturnRequest from "@/model/returnRequest.model";
import { returnReasonLabel, returnStatusLabel } from "./labels";

export type ReturnMailEvent =
  | "requested"
  | "approved_return"
  | "approved_refund_only"
  | "rejected"
  | "escalated"
  | "picked_up"
  | "arrived_for_inspection"
  | "refund_pending"
  | "resolved_no_refund"
  | "expired_unshipped"
  | "closed_rejected"
  | "refunded"
  | "refund_failed";

// Tên người, lý do, ghi chú, mã vận đơn đều do NGƯỜI DÙNG nhập và được chèn thẳng vào
// HTML — không escape thì một cái tên chứa thẻ là đủ để bẻ layout mail hoặc nhét nội
// dung giả mạo vào thông báo mà người nhận tưởng là của sàn.
function esc(value?: string | null): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const money = (n?: number) =>
  `${Math.max(0, Math.round(n ?? 0)).toLocaleString("vi-VN")}₫`;

// Hạn gửi hàng phải hiện CỤ THỂ (ngày + giờ) để buyer không phải tự nhẩm "5 ngày nữa".
const dateTime = (d?: Date | string | null) =>
  d
    ? new Date(d).toLocaleString("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "";

const baseUrl = () => process.env.NEXTAUTH_URL ?? "";

function layout(
  title: string,
  body: string,
  cta?: { href: string; text: string },
) {
  const button =
    cta && baseUrl()
      ? `<p style="margin:24px 0"><a href="${baseUrl()}${cta.href}"
           style="background:#059669;color:#fff;padding:10px 18px;border-radius:6px;
                  text-decoration:none;display:inline-block">${cta.text}</a></p>`
      : "";
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;color:#111">
      <h2 style="margin:0 0 12px">${title}</h2>
      ${body}
      ${button}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
      <p style="font-size:12px;color:#6b7280">Email tự động từ Ecoshop — vui lòng không trả lời.</p>
    </div>`;
}

interface MailPlan {
  to: string;
  subject: string;
  html: string;
}

/**
 * Gửi thông báo cho đúng người theo sự kiện. Trả về void và nuốt mọi lỗi.
 */
export async function notifyReturnEvent(params: {
  returnRequestId: unknown;
  event: ReturnMailEvent;
  note?: string;
}): Promise<void> {
  try {
    const doc = await ReturnRequest.findById(params.returnRequestId)
      .populate("buyer", "name email")
      .populate("vendor", "name email shopName")
      .lean();
    if (!doc) return;

    const buyer = doc.buyer as { name?: string; email?: string } | undefined;
    const vendor = doc.vendor as
      | { name?: string; email?: string; shopName?: string }
      | undefined;

    // orderRef suy từ ObjectId nên vốn đã an toàn, nhưng escape hết cho nhất quán —
    // để sau này không ai phải đoán chỗ nào đã escape chỗ nào chưa.
    const orderRef = esc(String(doc.order).slice(-8).toUpperCase());
    const statusLine = `<p><b>Trạng thái:</b> ${esc(returnStatusLabel(doc.status))}</p>`;
    const reasonLine = `<p><b>Lý do:</b> ${esc(returnReasonLabel(doc.reasonCode))}</p>`;
    const noteLine = params.note
      ? `<p><b>Ghi chú:</b> ${esc(params.note)}</p>`
      : "";
    const amountLine = doc.refund?.amount
      ? `<p><b>Số tiền hoàn:</b> ${money(doc.refund.amount)}</p>`
      : "";

    const plan: MailPlan | null = (() => {
      switch (params.event) {
        case "requested":
          if (!vendor?.email) return null;
          return {
            to: vendor.email,
            subject: `[Ecoshop] Yêu cầu trả hàng mới — đơn #${orderRef}`,
            html: layout(
              "Có yêu cầu trả hàng mới",
              `<p>Người mua <b>${esc(buyer?.name)}</b> vừa gửi yêu cầu trả hàng cho đơn <b>#${orderRef}</b>.</p>
               ${reasonLine}${statusLine}
               <p>Bạn cần phản hồi trong <b>3 ngày</b>. Quá hạn, yêu cầu sẽ được chuyển cho sàn phân xử.</p>`,
              { href: "/vendor", text: "Xem yêu cầu" },
            ),
          };

        case "approved_return": {
          if (!buyer?.email) return null;
          const waybill = doc.shipping?.trackingCode;
          const shipDeadline = doc.deadlines?.shipment;
          const pickupFrom = doc.shipping?.from;
          const pickupAddress = pickupFrom
            ? [
                pickupFrom.address,
                pickupFrom.wardName,
                pickupFrom.districtName,
                pickupFrom.provinceName,
              ]
                .filter(Boolean)
                .join(", ")
            : "";
          return {
            to: buyer.email,
            subject: `[Ecoshop] Yêu cầu trả hàng đã được duyệt — đơn #${orderRef}`,
            html: layout(
              "Yêu cầu trả hàng đã được duyệt",
              `<p>Đơn <b>#${orderRef}</b> đã được duyệt trả hàng. Vui lòng chuẩn bị gói hàng để gửi về người bán.</p>
               ${waybill ? `<p><b>Mã vận đơn hoàn:</b> ${esc(waybill)}</p>` : ""}
               ${
                 shipDeadline
                   ? `<p><b>Hạn gửi hàng:</b> trước ${esc(dateTime(shipDeadline))}. Quá hạn, yêu cầu sẽ tự đóng.</p>`
                   : `<p>Vui lòng gửi hàng trong <b>5 ngày</b>. Quá hạn, yêu cầu sẽ tự đóng.</p>`
               }
               ${
                 pickupAddress
                   ? `<p><b>Địa chỉ lấy hàng:</b> ${esc(pickupAddress)}${pickupFrom?.phone ? ` — ${esc(pickupFrom.phone)}` : ""}</p>`
                   : ""
               }
               <p><b>Hướng dẫn:</b> đóng đủ sản phẩm và phụ kiện, chèn lót cẩn thận, dán hoặc ghi mã vận đơn lên kiện, rồi vào đơn bấm <b>"Đã đóng gói, sẵn sàng bàn giao"</b> để đơn vị vận chuyển tới lấy.</p>`,
              { href: "/orders", text: "Xem yêu cầu" },
            ),
          };
        }

        case "approved_refund_only":
          if (!buyer?.email) return null;
          return {
            to: buyer.email,
            subject: `[Ecoshop] Được hoàn tiền, không cần trả hàng — đơn #${orderRef}`,
            html: layout(
              "Bạn được hoàn tiền mà không cần gửi hàng về",
              `<p>Đơn <b>#${orderRef}</b> đã được duyệt hoàn tiền.</p>${amountLine}
               <p>Sàn sẽ chuyển tiền và báo lại khi hoàn tất.</p>`,
              { href: "/orders", text: "Xem yêu cầu" },
            ),
          };

        case "rejected":
          if (!buyer?.email) return null;
          return {
            to: buyer.email,
            subject: `[Ecoshop] Yêu cầu trả hàng bị từ chối — đơn #${orderRef}`,
            html: layout(
              "Yêu cầu trả hàng bị từ chối",
              `<p>Người bán đã từ chối yêu cầu trả hàng cho đơn <b>#${orderRef}</b>.</p>
               ${noteLine}
               <p>Nếu không đồng ý, bạn có <b>3 ngày</b> để khiếu nại lên sàn phân xử.</p>`,
              { href: "/orders", text: "Khiếu nại" },
            ),
          };

        case "arrived_for_inspection":
          if (!vendor?.email) return null;
          return {
            to: vendor.email,
            subject: `[Ecoshop] Hàng hoàn đã về — cần kiểm định đơn #${orderRef}`,
            html: layout(
              "Hàng hoàn đã về kho của bạn",
              `<p>Kiện hàng hoàn của đơn <b>#${orderRef}</b> đã được giao tới.</p>
               <p>Vui lòng kiểm định trong <b>3 ngày</b>. Quá hạn, sàn sẽ phân xử thay.</p>`,
              { href: "/vendor", text: "Kiểm định ngay" },
            ),
          };

        case "escalated": {
          const adminEmail = process.env.ADMIN_EMAIL;
          if (!adminEmail) return null;
          return {
            to: adminEmail,
            subject: `[Ecoshop] Case hoàn trả cần phân xử — đơn #${orderRef}`,
            html: layout(
              "Có case cần sàn phân xử",
              `<p>Case của đơn <b>#${orderRef}</b> đã được đẩy lên trọng tài.</p>
               ${reasonLine}${statusLine}${noteLine}`,
              { href: "/admin", text: "Xử lý case" },
            ),
          };
        }

        case "picked_up":
          if (!buyer?.email) return null;
          return {
            to: buyer.email,
            subject: `[Ecoshop] Đơn vị vận chuyển đã lấy hàng hoàn — đơn #${orderRef}`,
            html: layout(
              "Đơn vị vận chuyển đã lấy hàng",
              `<p>Kiện hàng hoàn của đơn <b>#${orderRef}</b> đã được đơn vị vận chuyển lấy đi và đang trên đường về người bán.</p>
               ${doc.shipping?.trackingCode ? `<p><b>Mã vận đơn hoàn:</b> ${esc(doc.shipping.trackingCode)}</p>` : ""}
               <p>Chúng tôi sẽ báo bạn khi người bán nhận và kiểm định hàng.</p>`,
              { href: "/orders", text: "Theo dõi yêu cầu" },
            ),
          };

        case "refund_pending":
          if (!buyer?.email) return null;
          return {
            to: buyer.email,
            subject: `[Ecoshop] Đang xử lý hoàn tiền — đơn #${orderRef}`,
            html: layout(
              "Yêu cầu của bạn đã được chấp nhận",
              `<p>Đơn <b>#${orderRef}</b> đã được duyệt hoàn tiền.</p>${amountLine}
               <p>Sàn sẽ chuyển tiền và báo lại khi hoàn tất.</p>`,
              { href: "/orders", text: "Xem yêu cầu" },
            ),
          };

        case "resolved_no_refund":
          if (!buyer?.email) return null;
          return {
            to: buyer.email,
            subject: `[Ecoshop] Đã xử lý yêu cầu - đơn #${orderRef}`,
            html: layout(
              "Yêu cầu đã được xử lý",
              `<p>Yêu cầu của đơn <b>#${orderRef}</b> đã được chấp nhận.</p>
               <p>Đơn chưa phát sinh khoản thanh toán cần hoàn lại.</p>${noteLine}`,
              { href: "/orders", text: "Xem yêu cầu" },
            ),
          };

        case "expired_unshipped":
          if (!buyer?.email) return null;
          return {
            to: buyer.email,
            subject: `[Ecoshop] Yêu cầu trả hàng đã hết hạn - đơn #${orderRef}`,
            html: layout(
              "Yêu cầu trả hàng đã hết hạn",
              `<p>Yêu cầu của đơn <b>#${orderRef}</b> đã đóng vì hàng không được gửi trong thời hạn quy định.</p>`,
              { href: "/orders", text: "Xem yêu cầu" },
            ),
          };

        case "closed_rejected":
          if (!buyer?.email) return null;
          return {
            to: buyer.email,
            subject: `[Ecoshop] Yêu cầu trả hàng đã đóng - đơn #${orderRef}`,
            html: layout(
              "Yêu cầu trả hàng đã đóng",
              `<p>Thời hạn khiếu nại cho đơn <b>#${orderRef}</b> đã kết thúc và quyết định từ chối được giữ nguyên.</p>`,
              { href: "/orders", text: "Xem yêu cầu" },
            ),
          };

        case "refunded":
          if (!buyer?.email) return null;
          return {
            to: buyer.email,
            subject: `[Ecoshop] Đã hoàn tiền — đơn #${orderRef}`,
            html: layout(
              "Đã hoàn tiền cho bạn",
              `<p>Sàn đã hoàn tiền cho đơn <b>#${orderRef}</b>.</p>${amountLine}
               ${doc.refund?.method ? `<p><b>Phương thức:</b> ${esc(doc.refund.method)}</p>` : ""}
               ${doc.refund?.reference ? `<p><b>Mã tham chiếu:</b> ${esc(doc.refund.reference)}</p>` : ""}
               <p>Tuỳ ngân hàng, tiền có thể về tài khoản sau vài ngày làm việc.</p>`,
              { href: "/orders", text: "Xem chi tiết" },
            ),
          };

        case "refund_failed":
          if (!buyer?.email) return null;
          return {
            to: buyer.email,
            subject: `[Ecoshop] Hoàn tiền chưa thành công — đơn #${orderRef}`,
            html: layout(
              "Hoàn tiền chưa thành công",
              `<p>Lần chuyển tiền cho đơn <b>#${orderRef}</b> chưa thành công.</p>
               ${noteLine}
               <p>Sàn sẽ liên hệ và thử lại — bạn không cần làm gì thêm.</p>`,
              { href: "/orders", text: "Xem chi tiết" },
            ),
          };

        default:
          return null;
      }
    })();

    if (!plan) return;
    await sendMail(plan);
  } catch (error) {
    // Nuốt lỗi có chủ đích: dữ liệu đã ghi xong, mail hỏng không được phép lan ra.
    console.error("[returns/mail] gửi thông báo thất bại:", error);
  }
}
