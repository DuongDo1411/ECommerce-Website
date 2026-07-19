import { mapGhnStatusToOrderStatus } from "@/lib/ghn";
import { commitBatchIfTerminalWithDelivery } from "@/lib/voucher/lifecycle";
import Order, { type IOrder } from "@/model/order.model";
import ReturnRequest, { type ReturnStatus } from "@/model/returnRequest.model";
import type { ClientSession, HydratedDocument } from "mongoose";
import { notifyReturnEvent } from "./mail";
import { addDays, computeReturnEligibleUntil, DEADLINE_DAYS } from "./policy";
import { withReturnTransaction } from "./transaction";
import { transitionReturn } from "./transition";

const REVERSE_IN_TRANSIT = [
  "picked",
  "storing",
  "transporting",
  "sorting",
  "delivering",
  "money_collect_delivering",
];
const REVERSE_EXCEPTION = ["return_fail", "lost", "damage", "exception"];
const REVERSE_CANCELLED = ["cancel", "cancelled"];

export interface ApplyEventResult {
  applied: boolean;
  status?: ReturnStatus;
  note?: string;
}

function shippingLog(status: string, time: Date) {
  return { "shipping.statusLog": { status, time } };
}

export async function applyReturnShipmentEvent(params: {
  returnRequestId: unknown;
  status: string;
  time?: Date;
}): Promise<ApplyEventResult> {
  const status = params.status;
  const time = params.time ?? new Date();
  const doc = await ReturnRequest.findById(params.returnRequestId);
  if (!doc) return { applied: false, note: "not_found" };

  const current = doc.status as ReturnStatus;
  let result;

  if (REVERSE_IN_TRANSIT.includes(status)) {
    if (current === "return_in_transit") {
      const logged = await ReturnRequest.updateOne(
        { _id: doc._id, "shipping.status": { $ne: status } },
        {
          $set: { "shipping.status": status },
          $push: shippingLog(status, time),
        },
      );
      return {
        applied: logged.modifiedCount === 1,
        status: current,
        note: logged.modifiedCount === 1 ? "logged" : "duplicate",
      };
    }
    if (current !== "awaiting_return_shipment") {
      return { applied: false, status: current, note: "out_of_order" };
    }
    result = await transitionReturn({
      id: doc._id,
      from: current,
      action: "carrier_pickup",
      role: "system",
      reason: `GHN: ${status}`,
      set: { "shipping.status": status },
      push: shippingLog(status, time),
    });
  } else if (status === "delivered") {
    const commonSet = {
      "shipping.status": status,
      "shipping.receivedAt": time,
      "deadlines.inspection": addDays(time, DEADLINE_DAYS.inspection),
    };
    if (
      current === "escalated" &&
      doc.escalation?.stage === "return_shipping"
    ) {
      result = await transitionReturn({
        id: doc._id,
        from: current,
        action: "late_delivery_to_vendor",
        role: "system",
        reason: "GHN: hàng hoàn giao tới sau khi đã escalation",
        set: commonSet,
        push: shippingLog(status, time),
        unset: ["escalation"],
      });
    } else if (
      current === "awaiting_return_shipment" ||
      current === "return_in_transit"
    ) {
      result = await transitionReturn({
        id: doc._id,
        from: current,
        action: "delivered_to_vendor",
        role: "system",
        reason: "GHN: hàng hoàn đã tới kho người bán",
        set: commonSet,
        push: shippingLog(status, time),
      });
    } else {
      return { applied: false, status: current, note: "out_of_order" };
    }
  } else if (REVERSE_EXCEPTION.includes(status)) {
    if (current === "return_in_transit") {
      result = await transitionReturn({
        id: doc._id,
        from: current,
        action: "carrier_exception",
        role: "system",
        reason: `GHN: ${status}`,
        set: { "shipping.status": status },
        push: shippingLog(status, time),
      });
    } else {
      return { applied: false, status: current, note: "out_of_order" };
    }
  } else if (REVERSE_CANCELLED.includes(status)) {
    if (
      current === "awaiting_return_shipment" ||
      current === "return_in_transit"
    ) {
      result = await transitionReturn({
        id: doc._id,
        from: current,
        action: "carrier_cancelled",
        role: "system",
        reason: "GHN xác nhận vận đơn đã hủy",
        set: { "shipping.status": status },
        push: shippingLog(status, time),
      });
    } else {
      return { applied: false, status: current, note: "out_of_order" };
    }
  }

  if (result?.ok) {
    if (result.to === "inspection_pending") {
      await notifyReturnEvent({
        returnRequestId: doc._id,
        event: "arrived_for_inspection",
      });
    } else if (result.to === "escalated") {
      await notifyReturnEvent({
        returnRequestId: doc._id,
        event: "escalated",
        note: `GHN: ${status}`,
      });
    } else if (result.to === "return_in_transit") {
      // GHN đã lấy hàng (carrier_pickup): báo buyer hàng đang trên đường về người bán.
      await notifyReturnEvent({
        returnRequestId: doc._id,
        event: "picked_up",
      });
    }
    return { applied: true, status: result.to };
  }
  if (result && !result.ok) {
    return { applied: false, status: current, note: result.error };
  }

  if (
    current !== "awaiting_return_shipment" &&
    current !== "return_in_transit"
  ) {
    return { applied: false, status: current, note: "out_of_order" };
  }

  const logged = await ReturnRequest.updateOne(
    { _id: doc._id, "shipping.status": { $ne: status } },
    {
      $set: { "shipping.status": status },
      $push: shippingLog(status, time),
    },
  );
  return {
    applied: logged.modifiedCount === 1,
    status: current,
    note: logged.modifiedCount === 1 ? "logged" : "duplicate",
  };
}

async function ensureDeliveryFailureCase(
  order: HydratedDocument<IOrder>,
  status: ReturnStatus,
  reason: string,
  physicalStatus: string,
  time: Date,
  session: ClientSession,
) {
  const existing = await ReturnRequest.findOne({ order: order._id }).session(
    session,
  );
  if (existing) {
    if (!order.returnRequest) order.returnRequest = existing._id;
    if (
      status === "inspection_pending" &&
      existing.status === "escalated" &&
      existing.escalation?.stage === "outbound_delivery"
    ) {
      const moved = await transitionReturn({
        id: existing._id,
        from: "escalated",
        action: "outbound_returned_to_vendor",
        role: "system",
        reason,
        set: {
          "shipping.status": physicalStatus,
          "shipping.receivedAt": time,
          "deadlines.inspection": addDays(time, DEADLINE_DAYS.inspection),
        },
        push: shippingLog(physicalStatus, time),
        unset: ["escalation"],
        session,
      });
      return moved.ok ? moved.doc : existing;
    }
    return existing;
  }

  const [created] = await ReturnRequest.create(
    [
      {
        order: order._id,
        buyer: order.buyer,
        vendor: order.productVendor,
        caseType: "delivery_failure",
        status,
        reasonCode: "not_received",
        description: reason,
        evidence: [],
        claimedFaultParty: "carrier",
        finalFaultParty: "carrier",
        requestedAt: time,
        ...(status === "escalated"
          ? {
              escalation: {
                stage: "outbound_delivery",
                reason: "delivery_failure",
                at: time,
              },
            }
          : {
              shipping: {
                status: physicalStatus,
                receivedAt: time,
                statusLog: [{ status: physicalStatus, time }],
              },
            }),
        deadlines:
          status === "inspection_pending"
            ? { inspection: addDays(time, DEADLINE_DAYS.inspection) }
            : {},
        history: [
          {
            role: "system",
            action: "open_delivery_failure_case",
            toStatus: status,
            reason,
            at: time,
          },
        ],
      },
    ],
    { session },
  );
  order.returnRequest = created._id;
  return created;
}

export async function applyOutboundOrderEvent(params: {
  order: { _id: unknown };
  status: string;
  time?: Date;
  statusLog?: { status: string; time: Date }[];
}): Promise<ApplyEventResult> {
  const time = params.time ?? new Date();

  return withReturnTransaction(async (session) => {
    const order = await Order.findById(params.order._id).session(session);
    if (!order) return { applied: false, note: "not_found" };

    order.ghn = order.ghn ?? {};
    const previousStatus = order.ghn.status;
    order.ghn.status = params.status;
    order.ghn.statusLog =
      params.statusLog ?? [
        ...(order.ghn.statusLog ?? []),
        ...(previousStatus !== params.status
          ? [{ status: params.status, time }]
          : []),
      ];

    const mapped = mapGhnStatusToOrderStatus(params.status);
    if (mapped === "delivered") {
      order.orderStatus = "delivered";
      if (!order.deliveryDate) order.deliveryDate = time;
      if (order.paymentMethod === "cod") order.isPaid = true;
      order.returnEligibleUntil =
        computeReturnEligibleUntil(
          order.deliveryDate,
          order.returnWindowDaysSnapshot ?? 0,
        ) ?? undefined;
      await order.save({ session });
      await commitBatchIfTerminalWithDelivery(order.checkoutBatchId, session);
      return { applied: true, note: "delivered" };
    }

    if (mapped === "cancelled") {
      order.orderStatus = "cancelled";
      await order.save({ session });
      return { applied: true, note: "cancelled" };
    }

    if (mapped === "delivery_exception") {
      order.orderStatus = "delivery_exception";
      const caseStatus: ReturnStatus =
        params.status === "returned" ? "inspection_pending" : "escalated";
      await ensureDeliveryFailureCase(
        order,
        caseStatus,
        `GHN: ${params.status} - giao hàng không thành công`,
        params.status,
        time,
        session,
      );
      await order.save({ session });
      return { applied: true, status: caseStatus, note: params.status };
    }

    await order.save({ session });
    return { applied: true, note: "logged" };
  });
}
