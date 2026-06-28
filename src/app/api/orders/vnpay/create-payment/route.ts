import { auth } from "@/auth";
import { placeOrderBatch } from "@/lib/checkout/placeOrderBatch";
import { CheckoutError } from "@/lib/checkout/types";
import { createVnpayUrl } from "@/lib/vnpay";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const items = body.items ?? [];
    const addressId = body.addressId;
    const clientTotal = body.clientTotal;

    if (!Array.isArray(items) || items.length === 0 || !addressId) {
      return NextResponse.json({ message: "Thieu thong tin dat hang" }, { status: 400 });
    }
    if (typeof clientTotal !== "number") {
      return NextResponse.json({ message: "clientTotal is required" }, { status: 400 });
    }

    const result = await placeOrderBatch({
      userId: session.user.id,
      items,
      addressId,
      clientTotal,
      paymentMethod: "vnpay",
      voucherSelection: {
        shopVoucherCodes: body.shopVoucherCodes ?? [],
        platformVoucherCode: body.platformVoucherCode,
        freeshipVoucherCode: body.freeshipVoucherCode,
      },
      checkoutRequestId: body.checkoutRequestId,
    });

    if (!result.txnRef) {
      return NextResponse.json(
        { message: "Khong the tao don hang VNPay" },
        { status: 500 },
      );
    }

    // Tạo VNPay URL SAU transaction (không đưa I/O ngoài vào transaction).
    const forwarded = req.headers.get("x-forwarded-for");
    const ipAddr = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";
    const paymentUrl = createVnpayUrl({
      txnRef: result.txnRef,
      amount: result.amount,
      orderInfo: `Thanh toan don hang ${result.txnRef}`,
      ipAddr,
    });

    return NextResponse.json(
      {
        paymentUrl,
        txnRef: result.txnRef,
        checkoutBatchId: result.checkoutBatchId,
        orderIds: result.orderIds,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof CheckoutError) {
      return NextResponse.json(
        { message: error.message, ...(error.details ?? {}) },
        { status: error.status },
      );
    }
    console.error(error);
    return NextResponse.json(
      { message: "Khong the tao don hang VNPay" },
      { status: 500 },
    );
  }
}
