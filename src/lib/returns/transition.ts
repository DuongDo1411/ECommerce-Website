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
import type { ClientSession } from "mongoose";
import {
  ESCALATION_BY_ACTION,
  validateTransition,
  type ActorRole,
} from "./policy";

export type TransitionError =
  | "unknown_action"
  | "invalid_from"
  | "forbidden_role"
  | "conflict";

export type TransitionOutcome =
  | { ok: true; to: ReturnStatus; doc: IReturnRequest }
  | { ok: false; error: TransitionError };

export async function transitionReturn(params: {
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
}): Promise<TransitionOutcome> {
  const validated = validateTransition(params.from, params.action, params.role);
  if (!validated.ok) return { ok: false, error: validated.error! };

  const to = validated.to!;
  const now = new Date();

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
    { returnDocument: "after", session: params.session },
  );

  if (!doc) return { ok: false, error: "conflict" };
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
