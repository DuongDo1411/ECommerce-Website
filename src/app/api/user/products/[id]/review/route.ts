import connectDB from "@/lib/connectDB";
import uploadOnCloudinary from "@/lib/cloudinary";
import Product from "@/model/product.model";
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await connectDB();
    const { id } = await params;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const rating = Number(formData.get("rating"));
    const comment = formData.get("comment") as string | null;
    const imageFile = formData.get("image") as Blob | null;

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { message: "Rating phải từ 1 đến 5" },
        { status: 400 },
      );
    }

    // Upload ảnh review lên Cloudinary (nếu có)
    let imageUrl: string | undefined = undefined;
    if (imageFile && imageFile.size > 0) {
      const uploaded = await uploadOnCloudinary(imageFile);
      if (uploaded) imageUrl = uploaded;
    }

    const product = await Product.findById(id);
    if (!product) {
      return NextResponse.json(
        { message: "Sản phẩm không tồn tại" },
        { status: 404 },
      );
    }

    // Kiểm tra user đã review chưa
    const alreadyReviewed = product.reviews?.some(
      (r: any) => r.user?.toString() === session.user!.id,
    );
    if (alreadyReviewed) {
      return NextResponse.json(
        { message: "Bạn đã đánh giá sản phẩm này rồi" },
        { status: 400 },
      );
    }

    const newReview: any = {
      user: session.user.id,
      rating,
      createdAt: new Date(),
    };
    if (comment?.trim()) newReview.comment = comment.trim();
    if (imageUrl) newReview.image = imageUrl;

    product.reviews = product.reviews ?? [];
    product.reviews.push(newReview);
    await product.save();

    // Populate user name for the new review to return
    await product.populate("reviews.user", "name image");

    const lastReview = product.reviews[product.reviews.length - 1];
    // Serialize thủ công để đảm bảo user populated không bị mất khi JSON
    const savedReview = {
      _id: lastReview._id,
      rating: lastReview.rating,
      comment: lastReview.comment,
      image: lastReview.image,
      createdAt: lastReview.createdAt,
      user: {
        _id: (lastReview.user as any)?._id,
        name: (lastReview.user as any)?.name,
        image: (lastReview.user as any)?.image,
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
