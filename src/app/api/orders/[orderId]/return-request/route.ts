import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import { collectEvidence, discardEvidence } from "@/lib/returns/evidence";
import { notifyReturnEvent } from "@/lib/returns/mail";
import {
  addDays,
  checkReturnEligibility,
  computeReturnWindowDays,
  DEADLINE_DAYS,
  getReasonPolicy,
} from "@/lib/returns/policy";
import Order from "@/model/order.model";
import Product from "@/model/product.model";
import ReturnRequest, {
  type ReturnReasonCode,
} from "@/model/returnRequest.model";
import {
  ReturnOperationError,
  withReturnTransaction,
} from "@/lib/returns/transaction";
import type { ClientSession } from "mongoose";
import { NextRequest, NextResponse } from "next/server";

const REASONS: ReturnReasonCode[] = [
  "not_received",
  "missing_item",
  "wrong_item",
  "damaged",
  "defective",
  "not_as_described",
  "suspected_counterfeit",
  "changed_mind",
  "other",
];

const INELIGIBLE_MESSAGE: Record<string, { message: string; status: number }> = {
  already_requested: {
    message: "Đơn này đã có yêu cầu trả hàng",
    status: 409,
  },
  not_delivered: {
    message: "Chỉ có thể trả hàng sau khi đơn đã giao thành công",
    status: 400,
  },
  no_delivery_date: { message: "Đơn chưa có ngày giao hàng", status: 400 },
  window_zero: {
    message: "Sản phẩm trong đơn không hỗ trợ đổi/trả",
    status: 400,
  },
  window_closed: { message: "Đơn đã hết hạn đổi/trả", status: 400 },
};

async function currentProductReturnWindow(
  products: Array<{ product: unknown }>,
  session?: ClientSession,
): Promise<number> {
  const productIds = products.map((item) => {
    const ref = item.product as { _id?: unknown } | null;
    return ref?._id ?? item.product;
  });
  const query = Product.find({ _id: { $in: productIds } })
    .select("replacementDays")
    .lean();
  if (session) query.session(session);
  const current = await query;
  const byId = new Map(
    current.map((product) => [
      String(product._id),
      Math.max(0, Number(product.replacementDays ?? 0)),
    ]),
  );
  return computeReturnWindowDays(
    productIds.map((productId) => byId.get(String(productId)) ?? 0),
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    await connectDB();

    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { orderId } = await params;
    const form = await req.formData();
    const reasonCode = String(form.get("reasonCode") ?? "") as ReturnReasonCode;
    const description = String(form.get("description") ?? "").trim();

    if (!REASONS.includes(reasonCode)) {
      return NextResponse.json(
        { message: "Lý do trả hàng không hợp lệ" },
        { status: 400 },
      );
    }
    if (!description) {
      return NextResponse.json(
        { message: "Vui lòng mô tả chi tiết vấn đề" },
        { status: 400 },
      );
    }

    // Ownership: chỉ chủ đơn mới được mở yêu cầu.
    const order = await Order.findOne({ _id: orderId, buyer: userId });
    if (!order) {
      return NextResponse.json(
        { message: "Không tìm thấy đơn hàng" },
        { status: 404 },
      );
    }

    const existing = await ReturnRequest.findOne({ order: order._id }).select(
      "_id",
    );

    // Ưu tiên snapshot khóa lúc đặt; fallback cho đơn legacy chưa backfill.
    const hasSnapshot = typeof order.returnWindowDaysSnapshot === "number";
    const windowDays = hasSnapshot
      ? order.returnWindowDaysSnapshot
      : await currentProductReturnWindow(order.products ?? []);

    const eligibility = checkReturnEligibility({
      orderStatus: order.orderStatus,
      deliveryDate: order.deliveryDate,
      windowDays,
      hasOpenReturnRequest: !!existing,
    });
    if (!eligibility.eligible) {
      const mapped = INELIGIBLE_MESSAGE[eligibility.reason ?? ""] ?? {
        message: "Đơn không đủ điều kiện trả hàng",
        status: 400,
      };
      return NextResponse.json(
        { message: mapped.message },
        { status: mapped.status },
      );
    }

    const policy = getReasonPolicy(reasonCode);
    const evidence = await collectEvidence(form);
    if ("error" in evidence) {
      return NextResponse.json(
        { message: evidence.error.message },
        { status: 400 },
      );
    }
    if (policy.requiresEvidence && evidence.urls.length === 0) {
      return NextResponse.json(
        { message: "Vui lòng đính kèm ít nhất 1 ảnh bằng chứng" },
        { status: 400 },
      );
    }

    let created;
    try {
      created = await withReturnTransaction(async (dbSession) => {
        const txOrder = await Order.findOne({
          _id: orderId,
          buyer: userId,
        }).session(dbSession);
        if (!txOrder) {
          throw new ReturnOperationError("Không tìm thấy đơn hàng", 404);
        }

        const txExisting = await ReturnRequest.findOne({ order: txOrder._id })
          .select("_id")
          .session(dbSession);
        const txHasSnapshot =
          typeof txOrder.returnWindowDaysSnapshot === "number";
        const txWindowDays = txHasSnapshot
          ? txOrder.returnWindowDaysSnapshot
          : await currentProductReturnWindow(
              txOrder.products ?? [],
              dbSession,
            );
        const txEligibility = checkReturnEligibility({
          orderStatus: txOrder.orderStatus,
          deliveryDate: txOrder.deliveryDate,
          windowDays: txWindowDays,
          hasOpenReturnRequest: !!txExisting,
        });
        if (!txEligibility.eligible) {
          const mapped = INELIGIBLE_MESSAGE[txEligibility.reason ?? ""] ?? {
            message: "Đơn không đủ điều kiện trả hàng",
            status: 400,
          };
          throw new ReturnOperationError(mapped.message, mapped.status);
        }

        const now = new Date();
        const [createdDoc] = await ReturnRequest.create(
          [
            {
              order: txOrder._id,
              buyer: userId,
              vendor: txOrder.productVendor,
              caseType: "customer_return",
              status: "requested",
              reasonCode,
              description,
              evidence: evidence.urls,
              claimedFaultParty: policy.faultHint,
              requestedAt: now,
              deadlines: {
                vendorResponse: addDays(now, DEADLINE_DAYS.vendorResponse),
              },
              history: [
                {
                  actor: userId,
                  role: "buyer",
                  action: "create_request",
                  toStatus: "requested",
                  reason: reasonCode,
                  at: now,
                },
              ],
            },
          ],
          { session: dbSession },
        );

        txOrder.returnRequest = createdDoc._id;
        if (!txHasSnapshot) {
          txOrder.returnWindowDaysSnapshot = txWindowDays;
          txOrder.returnEligibleUntil =
            txEligibility.eligibleUntil ?? undefined;
          txOrder.returnPolicySource = "legacy_fallback";
        }
        await txOrder.save({ session: dbSession });
        return createdDoc;
      });
    } catch (error) {
      await discardEvidence(evidence);
      throw error;
    }

    // Sau khi đã ghi xong: báo vendor. Mail hỏng không được làm hỏng yêu cầu đã tạo.
    await notifyReturnEvent({
      returnRequestId: created._id,
      event: "requested",
    });

    return NextResponse.json(
      {
        message: "Đã gửi yêu cầu trả hàng",
        returnRequestId: created._id,
        status: created.status,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ReturnOperationError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }
    // Unique index trên `order` chặn race tạo 2 case cho cùng đơn.
    if ((error as { code?: number })?.code === 11000) {
      return NextResponse.json(
        { message: "Đơn này đã có yêu cầu trả hàng" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { message: `Không tạo được yêu cầu trả hàng: ${error}` },
      { status: 500 },
    );
  }
}
