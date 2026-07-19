import mongoose from "mongoose";
import { IOrder } from "./order.model";
import { IUser } from "./user.model";

/* ─────────────────────────────  Enums  ───────────────────────────── */

export type ReturnCaseType = "customer_return" | "delivery_failure";

export type ReturnStatus =
  | "requested"
  | "awaiting_return_shipment"
  | "return_in_transit"
  | "inspection_pending"
  | "vendor_rejected"
  | "escalated"
  | "refund_pending"
  | "refunded"
  | "refund_failed"
  // Yêu cầu ĐƯỢC CHẤP NHẬN nhưng không phát sinh tiền hoàn: điển hình là COD chưa thu
  // tiền. Không được đẩy các case này vào refund_pending — chúng sẽ nằm mãi trong hàng
  // đợi hoàn tiền của admin mà chẳng có gì để chuyển.
  | "resolved_no_refund"
  | "closed_rejected"
  | "cancelled_by_buyer"
  | "expired_unshipped";

export type ReturnReasonCode =
  | "not_received"
  | "missing_item"
  | "wrong_item"
  | "damaged"
  | "defective"
  | "not_as_described"
  | "suspected_counterfeit"
  | "changed_mind"
  | "other";

export type ReturnResolution =
  | "return_and_refund"
  | "refund_only"
  // Chấp nhận yêu cầu nhưng không có tiền để hoàn (COD chưa thu tiền).
  | "no_refund"
  | "rejected";

export type FaultParty = "vendor" | "buyer" | "carrier" | "unknown";

export type StockDisposition = "restock" | "damaged" | "lost" | "quarantine";

export type ReturnShippingMode = "ghn" | "manual";

// Case leo thang ở GIAI ĐOẠN nào — quyết định admin được làm gì.
// "escalated" trần là không đủ: tranh chấp lúc vendor chưa duyệt và tranh chấp lúc hàng
// đã nằm trong kho vendor cần hai bộ hành động hoàn toàn khác nhau.
export type EscalationStage =
  | "vendor_review" // vendor từ chối / im lặng, hàng chưa đi đâu
  | "return_shipping" // đang hoàn về mà vận đơn gặp sự cố
  | "inspection" // hàng đã tới vendor nhưng kiểm định bế tắc
  | "outbound_delivery"; // đơn giao đi thất bại

export type EscalationReason =
  | "buyer_appeal"
  | "vendor_timeout"
  | "inspection_timeout"
  | "carrier_exception"
  | "delivery_failure";

/* ─────────────────────────  Sub-doc interfaces  ──────────────────── */

export interface IReturnAddressSnapshot {
  name?: string;
  phone?: string;
  address?: string;
  wardCode?: string;
  wardName?: string;
  districtId?: number;
  districtName?: string;
  provinceId?: number;
  provinceName?: string;
}

export interface IReturnRefund {
  // Breakdown giữ lại để audit — số tiền suy ra từ kết luận cuối cùng.
  itemNet?: number;
  outboundShippingRefund?: number;
  returnShippingDeduction?: number;
  amount?: number;
  method?: string; // vd: "vnpay_manual" | "bank_transfer" | "cash"
  reference?: string;
  note?: string;
  status?: "none" | "pending" | "processed" | "failed";
  processedBy?: mongoose.Types.ObjectId;
  processedAt?: Date;
}

export interface IReturnHistoryEntry {
  actor?: mongoose.Types.ObjectId;
  role: "buyer" | "vendor" | "admin" | "system";
  action: string;
  fromStatus?: ReturnStatus;
  toStatus?: ReturnStatus;
  reason?: string;
  at: Date;
}

/* ─────────────────────────────  Document  ────────────────────────── */

export interface IReturnRequest {
  _id?: mongoose.Types.ObjectId;

  order: mongoose.Types.ObjectId | IOrder;
  buyer: mongoose.Types.ObjectId | IUser;
  vendor: mongoose.Types.ObjectId | IUser;

  caseType: ReturnCaseType;
  status: ReturnStatus;

  // Yêu cầu của người mua
  reasonCode: ReturnReasonCode;
  description?: string;
  evidence: string[]; // Cloudinary URLs
  requestedAt: Date;

  // Kết luận
  resolution?: ReturnResolution;
  claimedFaultParty?: FaultParty; // do buyer chọn (không tin trực tiếp)
  finalFaultParty?: FaultParty; // do vendor/admin chốt → quyết định phí ship & refund

  // Quyết định của vendor
  vendorDecision?: {
    action?: string;
    // Từ chối lúc chưa nhận hàng khác hẳn từ chối sau khi đã mở kiện ra kiểm —
    // cùng action "reject" nên phải ghi rõ giai đoạn để đối soát về sau.
    stage?: "request" | "inspection";
    reason?: string;
    evidence?: string[];
    actor?: mongoose.Types.ObjectId;
    at?: Date;
  };

  // Vì sao case rơi vào tay sàn. Set tự động trong transition engine khi vào "escalated".
  escalation?: {
    stage?: EscalationStage;
    reason?: EscalationReason;
    fromStatus?: ReturnStatus;
    at?: Date;
  };

  // Khiếu nại của buyer
  appeal?: {
    reason?: string;
    evidence?: string[];
    deadline?: Date;
    at?: Date;
  };

  // Quyết định của admin (trọng tài)
  adminDecision?: {
    action?: string;
    reason?: string;
    actor?: mongoose.Types.ObjectId;
    at?: Date;
  };

  // Vận chuyển chiều ngược
  shipping?: {
    mode?: ReturnShippingMode;
    payer?: "vendor" | "buyer" | "platform";
    carrier?: string;
    trackingCode?: string;
    from?: IReturnAddressSnapshot; // buyer (người gửi)
    to?: IReturnAddressSnapshot; // vendor (người nhận)
    ghn?: {
      orderCode?: string;
      sortCode?: string;
      serviceId?: number;
      fee?: number;
      expectedDeliveryTime?: Date;
    };
    status?: string; // trạng thái nội bộ: creating | ready_to_pick | ... | creation_failed
    statusLog?: { status: string; time: Date }[];
    // Người mua xác nhận đã đóng gói xong, sẵn sàng bàn giao cho GHN. CHỈ là lời khai
    // chuẩn bị hàng — KHÔNG phải bằng chứng GHN đã nhận, nên không đổi status và không tự
    // chứng minh đã gửi (cron vẫn đóng case quá hạn nếu GHN chưa lấy).
    buyerReadyAt?: Date;
    // Ảnh biên nhận buyer chụp khi tự gửi bằng hãng ngoài (vận đơn tự khai).
    handoverEvidence?: string[];
    // Vận đơn tự khai: buyer nói đã gửi lúc nào, vendor xác nhận nhận lúc nào.
    // Không có GHN đẩy sự kiện nên hai mốc này là nguồn sự thật duy nhất.
    submittedAt?: Date;
    receivedAt?: Date;
    receivedBy?: mongoose.Types.ObjectId;
  };

  // Kiểm định khi hàng về
  inspection?: {
    result?: "accepted" | "rejected";
    note?: string;
    evidence?: string[];
    disposition?: StockDisposition;
    actor?: mongoose.Types.ObjectId;
    at?: Date;
  };

  refund?: IReturnRefund;

  // Các mốc hạn (dùng cho cron xử lý timeout)
  deadlines?: {
    vendorResponse?: Date;
    shipment?: Date;
    inspection?: Date;
    appeal?: Date;
  };

  history: IReturnHistoryEntry[];

  createdAt?: Date;
  updatedAt?: Date;
}

/* ─────────────────────────────  Schema  ──────────────────────────── */

const addressSnapshotSchema = new mongoose.Schema<IReturnAddressSnapshot>(
  {
    name: String,
    phone: String,
    address: String,
    wardCode: String,
    wardName: String,
    districtId: Number,
    districtName: String,
    provinceId: Number,
    provinceName: String,
  },
  { _id: false },
);

const returnRequestSchema = new mongoose.Schema<IReturnRequest>(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    caseType: {
      type: String,
      enum: ["customer_return", "delivery_failure"],
      required: true,
    },

    status: {
      type: String,
      enum: [
        "requested",
        "awaiting_return_shipment",
        "return_in_transit",
        "inspection_pending",
        "vendor_rejected",
        "escalated",
        "refund_pending",
        "refunded",
        "refund_failed",
        "resolved_no_refund",
        "closed_rejected",
        "cancelled_by_buyer",
        "expired_unshipped",
      ],
      required: true,
      default: "requested",
      index: true,
    },

    reasonCode: {
      type: String,
      enum: [
        "not_received",
        "missing_item",
        "wrong_item",
        "damaged",
        "defective",
        "not_as_described",
        "suspected_counterfeit",
        "changed_mind",
        "other",
      ],
      required: true,
    },
    description: { type: String },
    evidence: { type: [String], default: [] },
    requestedAt: { type: Date, default: Date.now },

    resolution: {
      type: String,
      enum: ["return_and_refund", "refund_only", "no_refund", "rejected"],
    },
    claimedFaultParty: {
      type: String,
      enum: ["vendor", "buyer", "carrier", "unknown"],
    },
    finalFaultParty: {
      type: String,
      enum: ["vendor", "buyer", "carrier", "unknown"],
    },

    vendorDecision: {
      action: String,
      stage: { type: String, enum: ["request", "inspection"] },
      reason: String,
      evidence: { type: [String], default: undefined },
      actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      at: Date,
    },

    escalation: {
      stage: {
        type: String,
        enum: [
          "vendor_review",
          "return_shipping",
          "inspection",
          "outbound_delivery",
        ],
      },
      reason: {
        type: String,
        enum: [
          "buyer_appeal",
          "vendor_timeout",
          "inspection_timeout",
          "carrier_exception",
          "delivery_failure",
        ],
      },
      fromStatus: String,
      at: Date,
    },

    appeal: {
      reason: String,
      evidence: { type: [String], default: undefined },
      deadline: Date,
      at: Date,
    },

    adminDecision: {
      action: String,
      reason: String,
      actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      at: Date,
    },

    shipping: {
      mode: { type: String, enum: ["ghn", "manual"] },
      payer: { type: String, enum: ["vendor", "buyer", "platform"] },
      carrier: String,
      trackingCode: String,
      from: addressSnapshotSchema,
      to: addressSnapshotSchema,
      ghn: {
        orderCode: String,
        sortCode: String,
        serviceId: Number,
        fee: Number,
        expectedDeliveryTime: Date,
      },
      status: String,
      statusLog: [
        {
          status: String,
          time: Date,
        },
      ],
      buyerReadyAt: Date,
      handoverEvidence: { type: [String], default: undefined },
      submittedAt: Date,
      receivedAt: Date,
      receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },

    inspection: {
      result: { type: String, enum: ["accepted", "rejected"] },
      note: String,
      evidence: { type: [String], default: undefined },
      disposition: {
        type: String,
        enum: ["restock", "damaged", "lost", "quarantine"],
      },
      actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      at: Date,
    },

    refund: {
      itemNet: Number,
      outboundShippingRefund: Number,
      returnShippingDeduction: Number,
      amount: Number,
      method: String,
      reference: String,
      note: String,
      status: {
        type: String,
        enum: ["none", "pending", "processed", "failed"],
        default: "none",
      },
      processedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      processedAt: Date,
    },

    deadlines: {
      vendorResponse: Date,
      shipment: Date,
      inspection: Date,
      appeal: Date,
    },

    history: [
      {
        actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        role: {
          type: String,
          enum: ["buyer", "vendor", "admin", "system"],
          required: true,
        },
        action: { type: String, required: true },
        fromStatus: String,
        toStatus: String,
        reason: String,
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

// v1: mỗi Order chỉ có tối đa MỘT ReturnRequest.
returnRequestSchema.index({ order: 1 }, { unique: true });
// Queue cho vendor/admin: lọc theo vendor + trạng thái.
returnRequestSchema.index({ vendor: 1, status: 1, createdAt: -1 });
// Cron quét theo deadline.
returnRequestSchema.index({ status: 1, "deadlines.vendorResponse": 1 });
// Queue trọng tài của admin: lọc theo trạng thái + giai đoạn leo thang.
returnRequestSchema.index({ status: 1, "escalation.stage": 1, createdAt: -1 });

const ReturnRequest =
  mongoose.models?.ReturnRequest ||
  mongoose.model<IReturnRequest>("ReturnRequest", returnRequestSchema);

export default ReturnRequest;
