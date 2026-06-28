import type { ClientSession } from "mongoose";
import Voucher from "@/model/voucher.model";

export async function claimVoucherSlot(voucherId: string, session?: ClientSession) {
  const now = new Date();
  return Voucher.findOneAndUpdate(
    {
      _id: voucherId,
      isActive: true,
      startAt: { $lte: now },
      endAt: { $gte: now },
      $expr: { $lt: ["$usedQuota", "$totalQuota"] },
    },
    { $inc: { usedQuota: 1 } },
    { returnDocument: "after", session },
  );
}

export async function releaseVoucherSlot(voucherId: string, session?: ClientSession) {
  return Voucher.updateOne(
    { _id: voucherId, usedQuota: { $gt: 0 } },
    { $inc: { usedQuota: -1 } },
    { session },
  );
}
