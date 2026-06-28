import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import Product from "@/model/product.model";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await connectDB();

    const vendors = await User.find({ role: "vendor", isApproved: true })
      .select("_id name shopName image vendorProducts vendorReviews")
      .lean();

    const enriched = await Promise.all(
      vendors.map(async (vendor) => {
        const products = await Product.find({
          vendor: vendor._id,
          verificationStatus: "approved",
          isActive: true,
        })
          .select("reviews")
          .lean<{ reviews?: { rating: number }[] }[]>();

        const productCount = products.length;

        let totalRating = 0;
        let totalReviews = 0;
        for (const p of products) {
          const reviews = p.reviews ?? [];
          for (const r of reviews) {
            totalRating += r.rating;
            totalReviews++;
          }
        }
        const avgRating = totalReviews > 0 ? totalRating / totalReviews : 0;

        return {
          _id: vendor._id,
          name: vendor.name,
          shopName: vendor.shopName,
          image: vendor.image,
          productCount,
          avgRating: Math.round(avgRating * 10) / 10,
          reviewCount: totalReviews,
        };
      }),
    );

    return NextResponse.json({ vendors: enriched }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: `Lỗi server: ${error}` },
      { status: 500 },
    );
  }
}
