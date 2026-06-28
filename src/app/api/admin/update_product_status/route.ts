import connectDB from "@/lib/connectDB";
import { requireRole } from "@/lib/rbac";
import Product from "@/model/product.model";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const authz = await requireRole(["admin"], { mode: "api" });
    if (authz instanceof NextResponse) return authz;
    const { productId, status, rejectedReason } = await req.json();
    if (!productId || !status) {
      return NextResponse.json(
        { message: "Product ID and status are required" },
        { status: 400 },
      );
    }

    const product = await Product.findById(productId);
    if (!product) {
      return NextResponse.json({ message: "Product not found" }, { status: 404 });
    }

    if (status === "approved") {
      product.verificationStatus = "approved";
      product.approvedAt = new Date();
      product.rejectedReason = undefined;
    }

    if (status === "rejected") {
      product.verificationStatus = "rejected";
      product.rejectedReason =
        rejectedReason ||
        "Your application has been rejected by the admin. Please contact admin for more information";
    }

    await product.save();

    return NextResponse.json(
      { message: "Product status updated successfully", product },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: `Product status update error ${error}` },
      { status: 500 },
    );
  }
}
