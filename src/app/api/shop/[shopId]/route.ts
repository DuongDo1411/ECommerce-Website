import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import Product from "@/model/product.model";
import { NextRequest, NextResponse } from "next/server";

interface ShopReviewLean {
  rating: number;
}

interface ShopLeanProduct {
  _id: unknown;
  title: string;
  price: number;
  image1?: string;
  image2?: string;
  image3?: string;
  image4?: string;
  category?: string;
  isWearable?: boolean;
  stock?: number;
  isStockAvailable?: boolean;
  freeDelivery?: boolean;
  warranty?: string;
  payOnDelivery?: boolean;
  replacementDays?: number;
  vendor?: unknown;
  reviews?: ShopReviewLean[];
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    await connectDB();
    const { shopId } = await params;

    const vendor = await User.findOne({
      _id: shopId,
      role: "vendor",
      isApproved: true,
    })
      .select("_id name shopName image vendorReviews")
      .populate({ path: "vendorReviews.user", select: "name image", strictPopulate: false })
      .lean();

    if (!vendor) {
      return NextResponse.json(
        { message: "Cửa hàng không tồn tại" },
        { status: 404 },
      );
    }

    const { search, sort, minRating } = Object.fromEntries(
      req.nextUrl.searchParams,
    );

    const query = {
      vendor: shopId,
      verificationStatus: "approved",
      isActive: true,
    };

    let products = await Product.find(query)
      .select(
        "_id title price image1 image2 image3 image4 category reviews isWearable stock isStockAvailable freeDelivery warranty payOnDelivery replacementDays vendor",
      )
      .populate({ path: "vendor", select: "name shopName" })
      .lean<ShopLeanProduct[]>();

    // Filter by search
    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      products = products.filter((p) =>
        p.title.toLowerCase().includes(q),
      );
    }

    // Filter by minRating
    if (minRating) {
      const min = Number(minRating);
      products = products.filter((p) => {
        const reviews = p.reviews ?? [];
        if (reviews.length === 0) return false;
        const avg =
          reviews.reduce((s, r) => s + r.rating, 0) /
          reviews.length;
        return avg >= min;
      });
    }

    // Sort by price
    if (sort === "asc") {
      products.sort((a, b) => a.price - b.price);
    } else if (sort === "desc") {
      products.sort((a, b) => b.price - a.price);
    }

    // Compute avgRating per product for the response
    const productsWithRating = products.map((p) => {
      const reviews = p.reviews ?? [];
      const avgRating =
        reviews.length > 0
          ? reviews.reduce((s, r) => s + r.rating, 0) /
            reviews.length
          : 0;
      return {
        _id: p._id,
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
        vendor: p.vendor ?? null,
        reviews,
        reviewCount: reviews.length,
        avgRating: Math.round(avgRating * 10) / 10,
      };
    });

    return NextResponse.json(
      { vendor, products: productsWithRating },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: `Lỗi server: ${error}` },
      { status: 500 },
    );
  }
}
