// Engine chuyển trạng thái ReturnRequest.
// MỌI thay đổi status phải đi qua đây: validate bằng bảng state-machine trong
// policy.ts, ghi history, và CAS theo status hiện tại để hai action đồng thời
// không cùng thắng.

import ReturnRequest, {
  type IReturnRequest,
  type EscalationReason,
  type EscalationStage,
  type ReturnStatus,
} from "@/model/returnRequest.model";
import { enqueueReturnMailIntent } from "@/lib/mail/outbox";
import mongoose, { type ClientSession } from "mongoose";
import {
  ESCALATION_BY_ACTION,
  validateTransition,
  type ActorRole,
} from "./policy";

/**
 * Ý định gửi mail đi KÈM transition, ghi trong cùng transaction.
 *
 * Trước đây mail gửi sau khi transition xong và nuốt lỗi, nên hai thứ có thể lệch nhau:
 * trạng thái đã đổi mà người liên quan không hay biết. Ghi chung một transaction thì hoặc
 * cả hai cùng có, hoặc cả hai cùng không.
 */
export interface ReturnMailIntentInput {
  event: string;
  note?: string;
  /** Hoãn gửi tới mốc này (vd: chờ GHN cấp mã vận đơn rồi mới báo cho người mua). */
  notBefore?: Date;
}

export type TransitionError =
  | "unknown_action"
  | "invalid_from"
  | "forbidden_role"
  | "conflict";

export type TransitionOutcome =
  | { ok: true; to: ReturnStatus; doc: IReturnRequest }
  | { ok: false; error: TransitionError };

export interface TransitionParams {
  id: unknown;
  from: ReturnStatus;
  action: string;
  role: ActorRole;
  actorId?: unknown;
  reason?: string;
  session?: ClientSession;
  escalation?: { stage: EscalationStage; reason: EscalationReason };
  // Các field phụ set kèm trong CÙNG update (vd: vendorDecision, shipping...).
  set?: Record<string, unknown>;
  push?: Record<string, unknown>;
  unset?: string[];
  /** Thông báo phát sinh từ chính transition này, ghi cùng transaction. */
  mailIntent?: ReturnMailIntentInput;
}

export async function transitionReturn(
  params: TransitionParams,
): Promise<TransitionOutcome> {
  const validated = validateTransition(params.from, params.action, params.role);
  if (!validated.ok) return { ok: false, error: validated.error! };
  const to = validated.to!;

  // Caller đã mở transaction, hoặc chẳng có mail nào phải ghi kèm → chạy thẳng.
  if (params.session || !params.mailIntent) {
    return applyTransition(params, to, params.session);
  }

  // Có mail mà chưa có transaction: tự mở một cái. Thiếu bước này thì transition commit
  // xong mà outbox hỏng là trạng thái đổi trong im lặng — đúng cái lệch cần chặn.
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() =>
      applyTransition(params, to, session),
    );
  } finally {
    await session.endSession();
  }
}

async function applyTransition(
  params: TransitionParams,
  to: ReturnStatus,
  session?: ClientSession,
): Promise<TransitionOutcome> {
  const now = new Date();
  // Sinh _id tường minh để dedupeKey của mail trỏ được vào đúng dòng history đã sinh ra nó.
  const historyEntryId = new mongoose.Types.ObjectId();

  // Ghi giai đoạn leo thang trong CÙNG update với status: nếu để caller tự set thì chỉ
  // cần một chỗ quên là case nằm trong queue trọng tài mà admin không biết xử cái gì.
  const setDoc: Record<string, unknown> = { ...(params.set ?? {}), status: to };
  if (to === "escalated") {
    const escalation =
      params.escalation ?? ESCALATION_BY_ACTION[params.action];
    if (escalation) {
      setDoc["escalation.stage"] = escalation.stage;
      setDoc["escalation.reason"] = escalation.reason;
      setDoc["escalation.fromStatus"] = params.from;
      setDoc["escalation.at"] = now;
    }
  }

  // CAS: chỉ đổi nếu status vẫn đúng như lúc đọc.
  const update: Record<string, unknown> = {
    $set: setDoc,
    $push: {
      ...(params.push ?? {}),
      history: {
        _id: historyEntryId,
        actor: params.actorId,
        role: params.role,
        action: params.action,
        fromStatus: params.from,
        toStatus: to,
        reason: params.reason,
        at: now,
      },
    },
  };
  if (params.unset?.length) {
    update.$unset = Object.fromEntries(params.unset.map((path) => [path, ""]));
  }

  const doc = await ReturnRequest.findOneAndUpdate(
    { _id: params.id, status: params.from },
    update,
    { returnDocument: "after", session },
  );

  if (!doc) return { ok: false, error: "conflict" };

  if (params.mailIntent) {
    await enqueueReturnMailIntent(
      {
        returnRequestId: doc._id,
        event: params.mailIntent.event,
        note: params.mailIntent.note ?? params.reason,
        // Trạng thái ĐÍCH của chính transition này. Mail dựng sau vài phút, lúc đó case có
        // thể đã đi tiếp — báo trạng thái hiện tại cho một sự kiện cũ là sai lệch.
        statusAtEvent: to,
        historyEntryId,
        // Khoá gắn với DÒNG HISTORY, không phải case: cùng một case có thể escalate hai
        // lần hợp lệ ở hai giai đoạn khác nhau, và cả hai đều đáng được báo.
        dedupeKey: `return/${doc._id}/${historyEntryId}/${params.mailIntent.event}`,
        notBefore: params.mailIntent.notBefore,
      },
      { session },
    );
  }

  return { ok: true, to, doc };
}

// Map lỗi transition → HTTP status + thông điệp tiếng Việt cho route.
export function transitionErrorResponse(error: TransitionError): {
  message: string;
  status: number;
} {
  switch (error) {
    case "unknown_action":
      return { message: "Hành động không hợp lệ", status: 400 };
    case "forbidden_role":
      return {
        message: "Bạn không có quyền thực hiện hành động này",
        status: 403,
      };
    case "invalid_from":
      return {
        message: "Không thể thực hiện ở trạng thái hiện tại của yêu cầu",
        status: 409,
      };
    case "conflict":
      return {
        message: "Yêu cầu vừa được cập nhật bởi thao tác khác, hãy tải lại",
        status: 409,
      };
  }
}
