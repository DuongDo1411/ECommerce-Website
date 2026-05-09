import connectDB from "@/lib/connectDB";
import Product from "@/model/product.model";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await connectDB();
    const { id } = await params;
    const product = await Product.findOne({
      _id: id,
      isActive: true,
      verificationStatus: "approved",
    }).populate("vendor", "name email shopName shopAddress image");

    if (!product) {
      return NextResponse.json({ message: "Product not found" }, { status: 404 });
    }
    return NextResponse.json(product, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: `Failed to get product: ${error}` },
      { status: 500 },
    );
  }
}
