import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import Product from "@/model/product.model";
import User from "@/model/user.model";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const session = await auth();
    const adminUser = await User.findById(session?.user?.id);

    if (!adminUser || adminUser.role !== "admin") {
      return NextResponse.json(
        {
          message: "Only admin can approve vendors Or admin is not found",
        },
        { status: 403 },
      );
    }
    const { productId, status, rejectedReason } = await req.json();
    if (!productId || !status) {
      return NextResponse.json(
        { message: "Product ID and status are required" },
        { status: 400 },
      );
    }

    const product = await Product.findById(productId);
    if (status === "approved") {
      ((product.verificationStatus = "approved"),
        (product.approvedAt = new Date()),
        (product.rejectedReason = undefined));
    }

    if (status === "rejected") {
      ((product.verificationStatus = "rejected"),
        (product.rejectedReason =
          rejectedReason ||
          "Your application has been rejected by the admin. Please contact admin for more information"));
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
