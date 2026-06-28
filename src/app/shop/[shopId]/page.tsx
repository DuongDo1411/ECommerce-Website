import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import Product from "@/model/product.model";
import { notFound, redirect } from "next/navigation";
import Navbar from "@/app/component/Navbar";
import Footer from "@/app/component/Footer";
import ShopDetailClient from "./ShopDetailClient";

interface ShopProductReviewDoc {
  rating?: number;
}

interface ShopProductDoc {
  _id: unknown;
  title?: string;
  price?: number;
  image1?: string;
  image2?: string | null;
  image3?: string | null;
  image4?: string | null;
  category?: string;
  reviews?: ShopProductReviewDoc[];
  isWearable?: boolean;
  stock?: number;
  isStockAvailable?: boolean;
  freeDelivery?: boolean;
  warranty?: string;
  payOnDelivery?: boolean;
  replacementDays?: number;
  vendor?: unknown;
}

export default async function ShopDetailPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  await connectDB();
  const { shopId } = await params;

  const session = await auth();
  const currentUser = await User.findById(session?.user?.id);
  if (!currentUser) redirect("/login");

  const vendor = await User.findOne({
    _id: shopId,
    role: "vendor",
    isApproved: true,
  })
    .select("_id name shopName image shopBackground vendorReviews")
    .populate({ path: "vendorReviews.user", select: "name image", strictPopulate: false })
    .lean();

  if (!vendor) notFound();

  const products = await Product.find({
    vendor: shopId,
    verificationStatus: "approved",
    isActive: true,
  })
    .select(
      "_id title price image1 image2 image3 image4 category reviews isWearable stock isStockAvailable freeDelivery warranty payOnDelivery replacementDays vendor",
    )
    .populate({ path: "vendor", select: "name shopName" })
    .lean<ShopProductDoc[]>();

  const productsWithRating = products.map((p) => {
    const reviews = p.reviews ?? [];
    const avgRating =
      reviews.length > 0
        ? reviews.reduce((s, r) => s + (r.rating ?? 0), 0) /
          reviews.length
        : 0;
    return {
      _id: String(p._id),
      title: p.title,
      price: p.price,
      image1: p.image1,
      image2: p.image2 ?? null,
      image3: p.image3 ?? null,
      image4: p.image4 ?? null,
      category: p.category ?? "",
      isWearable: p.isWearable,
      stock: p.stock,
      isStockAvailable: p.isStockAvailable,
      freeDelivery: p.freeDelivery,
      warranty: p.warranty,
      payOnDelivery: p.payOnDelivery ?? false,
      replacementDays: p.replacementDays ?? 0,
      reviews: reviews,
      vendor: p.vendor ?? null,
      reviewCount: reviews.length,
      avgRating: Math.round(avgRating * 10) / 10,
    };
  });

  const plainVendor = JSON.parse(JSON.stringify(vendor));
  const plainUser = JSON.parse(JSON.stringify(currentUser));
  const plainProducts = JSON.parse(JSON.stringify(productsWithRating));

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-950 to-black text-white">
      <Navbar user={plainUser} />
      <div className="pt-20">
        <ShopDetailClient
          vendor={plainVendor}
          initialProducts={plainProducts}
          currentUserId={String(currentUser._id)}
        />
      </div>
      <Footer user={plainUser} />
    </div>
  );
}
