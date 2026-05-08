import { auth } from "@/auth";
import uploadOnCloudinary from "@/lib/cloudinary";
import connectDB from "@/lib/connectDB";
import Product from "@/model/product.model";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(req: NextRequest) {
  try {
    await connectDB();
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const productId = formData.get("productId") as string;

    if (!productId) {
      return NextResponse.json({ error: "Product ID required" }, { status: 400 });
    }

    // Ensure vendor owns this product
    const existingProduct = await Product.findOne({
      _id: productId,
      vendor: session.user.id,
    });

    if (!existingProduct) {
      return NextResponse.json(
        { error: "Product not found or unauthorized" },
        { status: 404 }
      );
    }

    // Parse fields
    const title = (formData.get("title") as string) || existingProduct.title;
    const description =
      (formData.get("description") as string) || existingProduct.description;
    const price = formData.get("price")
      ? Number(formData.get("price"))
      : existingProduct.price;
    const stock = formData.get("stock")
      ? Number(formData.get("stock"))
      : existingProduct.stock;
    const category =
      (formData.get("category") as string) || existingProduct.category;
    const isWearable =
      formData.get("isWearable") != null
        ? formData.get("isWearable") === "true"
        : existingProduct.isWearable;
    const sizes = formData.getAll("sizes") as string[];
    const replacementDays = formData.get("replacementDays")
      ? Number(formData.get("replacementDays"))
      : existingProduct.replacementDays;
    const freeDelivery =
      formData.get("freeDelivery") != null
        ? formData.get("freeDelivery") === "true"
        : existingProduct.freeDelivery;
    const warranty =
      (formData.get("warranty") as string) || existingProduct.warranty;
    const payOnDelivery =
      formData.get("payOnDelivery") != null
        ? formData.get("payOnDelivery") === "true"
        : existingProduct.payOnDelivery;
    const detailPoints = formData.getAll("detailPoints") as string[];

    // Handle images — only re-upload if new file provided
    const img1 = formData.get("image1") as Blob | null;
    const img2 = formData.get("image2") as Blob | null;
    const img3 = formData.get("image3") as Blob | null;
    const img4 = formData.get("image4") as Blob | null;

    const image1 =
      img1 && (img1 as File).size > 0
        ? await uploadOnCloudinary(img1)
        : existingProduct.image1;
    const image2 =
      img2 && (img2 as File).size > 0
        ? await uploadOnCloudinary(img2)
        : existingProduct.image2;
    const image3 =
      img3 && (img3 as File).size > 0
        ? await uploadOnCloudinary(img3)
        : existingProduct.image3;
    const image4 =
      img4 && (img4 as File).size > 0
        ? await uploadOnCloudinary(img4)
        : existingProduct.image4;

    const updated = await Product.findByIdAndUpdate(
      productId,
      {
        title,
        description,
        price,
        stock,
        isStockAvailable: stock > 0,
        category,
        isWearable,
        size: isWearable ? sizes : [],
        replacementDays,
        freeDelivery,
        warranty,
        payOnDelivery,
        detailsPoints: detailPoints.length > 0 ? detailPoints : existingProduct.detailsPoints,
        image1,
        image2,
        image3,
        image4,
        // Resubmit for admin review
        verificationStatus: "pending",
        isActive: false,
        rejectedReason: "",
        requestedAt: new Date(),
      },
      { new: true }
    );

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error("Edit product error:", error);
    return NextResponse.json(
      { error: `Failed to update product: ${error}` },
      { status: 500 }
    );
  }
}
