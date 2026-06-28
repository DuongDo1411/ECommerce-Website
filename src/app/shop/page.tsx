import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import Product from "@/model/product.model";
import { redirect } from "next/navigation";
import Navbar from "@/app/component/Navbar";
import Footer from "@/app/component/Footer";
import ShopListClient from "./ShopListClient";

interface ShopVendorDoc {
  _id: unknown;
  name?: string;
  shopName?: string;
  image?: string | null;
  shopBackground?: string | null;
}

interface ProductReviewDoc {
  rating?: number;
}

interface ProductReviewSummaryDoc {
  reviews?: ProductReviewDoc[];
}

export default async function ShopPage() {
  await connectDB();
  const session = await auth();
  const user = await User.findById(session?.user?.id);
  if (!user) redirect("/login");

  const vendors = await User.find({ role: "vendor", isApproved: true })
    .select("_id name shopName image shopBackground")
    .lean<ShopVendorDoc[]>();

  const enriched = await Promise.all(
    vendors.map(async (vendor) => {
      const products = await Product.find({
        vendor: vendor._id,
        verificationStatus: "approved",
        isActive: true,
      })
        .select("reviews")
        .lean<ProductReviewSummaryDoc[]>();

      const productCount = products.length;
      let totalRating = 0;
      let totalReviews = 0;
      for (const p of products) {
        const reviews = p.reviews ?? [];
        for (const r of reviews) {
          totalRating += r.rating ?? 0;
          totalReviews++;
        }
      }
      const avgRating =
        totalReviews > 0
          ? Math.round((totalRating / totalReviews) * 10) / 10
          : 0;

      return {
        _id: String(vendor._id),
        name: vendor.name ?? "",
        shopName: vendor.shopName ?? "",
        image: vendor.image ?? null,
        shopBackground: vendor.shopBackground ?? null,
        productCount,
        avgRating,
        reviewCount: totalReviews,
      };
    }),
  );

  const plainUser = JSON.parse(JSON.stringify(user));

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-950 to-black text-white">
      <Navbar user={plainUser} />
      <div className="pt-20">
        <ShopListClient vendors={enriched} />
      </div>
      <Footer user={plainUser} />
    </div>
  );
}
