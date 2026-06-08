import connectDB from "@/lib/connectDB";
import Product from "@/model/product.model";
import User from "@/model/user.model";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await connectDB();
    const vendors = await User.find({ role: "vendor", verificationStatus: { $ne: "rejected" } })
      .select("_id name email phone image shopName shopAddress shopAddressDetail taxNumber isApproved verificationStatus rejectedReason requestedAt approvedAt createdAt")
      .sort({ createdAt: -1 })
      .lean();

    if (!vendors) {
      return NextResponse.json({ message: "Vendors not found" }, { status: 400 });
    }

    const enriched = await Promise.all(
      vendors.map(async (v: any) => {
        const [totalProducts, approvedProducts] = await Promise.all([
          Product.countDocuments({ vendor: v._id }),
          Product.countDocuments({ vendor: v._id, verificationStatus: "approved", isActive: true }),
        ]);
        return {
          _id: String(v._id),
          name: v.name ?? "",
          email: v.email ?? "",
          phone: v.phone ?? "",
          image: v.image ?? null,
          shopName: v.shopName ?? "",
          shopAddress: v.shopAddress ?? "",
          shopAddressDetail: v.shopAddressDetail ?? null,
          taxNumber: v.taxNumber ?? "",
          isApproved: v.isApproved ?? false,
          verificationStatus: v.verificationStatus ?? "pending",
          rejectedReason: v.rejectedReason ?? "",
          requestedAt: v.requestedAt ?? null,
          approvedAt: v.approvedAt ?? null,
          createdAt: v.createdAt ?? null,
          totalProducts,
          approvedProducts,
        };
      }),
    );

    return NextResponse.json({ vendors: enriched }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ message: `get AllVendors error ${error}` }, { status: 500 });
  }
}
