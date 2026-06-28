import { auth } from "@/auth";
import { placeOrderBatch } from "@/lib/checkout/placeOrderBatch";
import { CheckoutError } from "@/lib/checkout/types";
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
      paymentMethod: "cod",
      voucherSelection: {
        shopVoucherCodes: body.shopVoucherCodes ?? [],
        platformVoucherCode: body.platformVoucherCode,
        freeshipVoucherCode: body.freeshipVoucherCode,
      },
      checkoutRequestId: body.checkoutRequestId,
    });

    return NextResponse.json(
      {
        message: "COD Order placed successfully",
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
      { message: "Khong the tao don hang COD" },
      { status: 500 },
    );
  }
}
