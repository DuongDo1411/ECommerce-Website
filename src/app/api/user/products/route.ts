import connectDB from "@/lib/connectDB";
import Product from "@/model/product.model";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await connectDB();
    const products = await Product.find({
      isActive: true,
      verificationStatus: "approved",
    })
      .populate("vendor", "name email shopName image")
      .sort({ createdAt: -1 });
    return NextResponse.json(products, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: `Failed to get products: ${error}` },
      { status: 500 },
    );
  }
}
