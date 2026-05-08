import connectDB from "@/lib/connectDB";
import Product from "@/model/product.model";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await connectDB();
    const products = await Product.find()
      .populate("vendor", "name email shopName")
      .sort({ createdAt: -1 });
    return NextResponse.json(products, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: `failed to get all products ${error}` },
      { status: 500 },
    );
  }
}
