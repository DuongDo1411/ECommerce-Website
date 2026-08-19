import connectDB from "@/lib/connectDB";
import { sellableProductFilter } from "@/lib/sellable";
import Product from "@/model/product.model";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await connectDB();
    // Bo loc dung chung: san pham hop le VA nha ban dang duoc duyet.
    const products = await Product.find(await sellableProductFilter())
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
