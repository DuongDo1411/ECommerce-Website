import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import { auth } from "@/auth";
import { getPopulatedUser } from "@/lib/productView";
import { NextRequest, NextResponse } from "next/server";

interface NewVendorReview {
  user: string;
  rating: number;
  createdAt: Date;
  comment?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> },
) {
  try {
    await connectDB();
    const { shopId } = await params;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { rating, comment } = await req.json();

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { message: "Rating phải từ 1 đến 5" },
        { status: 400 },
      );
    }

    const vendor = await User.findOne({
      _id: shopId,
      role: "vendor",
      isApproved: true,
    });

    if (!vendor) {
      return NextResponse.json(
        { message: "Cửa hàng không tồn tại" },
        { status: 404 },
      );
    }

    const alreadyReviewed = vendor.vendorReviews?.some(
      (r: { user?: { toString(): string } }) =>
        r.user?.toString() === session.user!.id,
    );
    if (alreadyReviewed) {
      return NextResponse.json(
        { message: "Bạn đã đánh giá cửa hàng này rồi" },
        { status: 400 },
      );
    }

    const newReview: NewVendorReview = {
      user: session.user.id,
      rating,
      createdAt: new Date(),
    };
    if (comment?.trim()) newReview.comment = comment.trim();

    vendor.vendorReviews = vendor.vendorReviews ?? [];
    vendor.vendorReviews.push(newReview);
    await vendor.save();

    await vendor.populate({ path: "vendorReviews.user", select: "name image", strictPopulate: false });

    const last = vendor.vendorReviews[vendor.vendorReviews.length - 1];
    const populatedUser = getPopulatedUser(last.user);
    const savedReview = {
      _id: last._id,
      rating: last.rating,
      comment: last.comment,
      createdAt: last.createdAt,
      user: {
        _id: populatedUser._id,
        name: populatedUser.name,
        image: populatedUser.image,
      },
    };

    return NextResponse.json(
      { message: "Đánh giá thành công!", review: savedReview },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: `Lỗi server: ${error}` },
      { status: 500 },
    );
  }
}
