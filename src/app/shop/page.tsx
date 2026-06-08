import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import Product from "@/model/product.model";
import { redirect } from "next/navigation";
import Navbar from "@/app/component/Navbar";
import Footer from "@/app/component/Footer";
import ShopListClient from "./ShopListClient";

export default async function ShopPage() {
  await connectDB();
  const session = await auth();
  const user = await User.findById(session?.user?.id);
  if (!user) redirect("/login");

  const vendors = await User.find({ role: "vendor", isApproved: true })
    .select("_id name shopName image shopBackground")
    .lean();

  const enriched = await Promise.all(
    vendors.map(async (vendor) => {
      const products = await Product.find({
        vendor: (vendor as any)._id,
        verificationStatus: "approved",
        isActive: true,
      })
        .select("reviews")
        .lean();

      const productCount = products.length;
      let totalRating = 0;
      let totalReviews = 0;
      for (const p of products) {
        const reviews = (p as any).reviews ?? [];
        for (const r of reviews) {
          totalRating += r.rating;
          totalReviews++;
        }
      }
      const avgRating =
        totalReviews > 0
          ? Math.round((totalRating / totalReviews) * 10) / 10
          : 0;

      return {
        _id: String((vendor as any)._id),
        name: (vendor as any).name ?? "",
        shopName: (vendor as any).shopName ?? "",
        image: (vendor as any).image ?? null,
        shopBackground: (vendor as any).shopBackground ?? null,
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
