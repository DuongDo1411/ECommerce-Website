import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import Product from "@/model/product.model";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(req: NextRequest) {
  try {
    await connectDB();
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { productId } = await req.json();

    if (!productId) {
      return NextResponse.json(
        { error: "Product ID required" },
        { status: 400 }
      );
    }

    // Ensure vendor owns this product and it is approved
    const existingProduct = await Product.findOne({
      _id: productId,
      vendor: session.user.id,
      verificationStatus: "approved",
    });

    if (!existingProduct) {
      return NextResponse.json(
        { error: "Product not found, unauthorized, or not approved" },
        { status: 404 }
      );
    }

    // Toggle isActive
    const updated = await Product.findByIdAndUpdate(
      productId,
      { isActive: !existingProduct.isActive },
      { new: true }
    );

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error("Toggle active error:", error);
    return NextResponse.json(
      { error: `Failed to toggle product status: ${error}` },
      { status: 500 }
    );
  }
}
