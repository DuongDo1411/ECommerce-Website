import { auth } from "@/auth";
import uploadOnCloudinary from "@/lib/cloudinary";
import connectDB from "@/lib/connectDB";
import Product from "@/model/product.model";
import User from "@/model/user.model";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const session = await auth();
    if (!session || !session.user?.id || !session.user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 400 });
    }

    const formdata = await req.formData();
    const title = formdata.get("title") as string;
    const description = formdata.get("description") as string;
    const price = Number(formdata.get("price"));
    const stock = Number(formdata.get("stock"));
    const category = formdata.get("category") as string;
    const isWearable = formdata.get("isWearable") === "true";
    const sizes = formdata.getAll("sizes");
    const replacementDays = Number(formdata.get("replacementDays")) || 0;
    const freeDelivery = formdata.get("freeDelivery") === "true";
    const warranty = (formdata.get("warranty") as string) || "No warranty";
    const payOnDelivery = formdata.get("payOnDelivery") === "true";
    const detailPoints = formdata.getAll("detailPoints");
    const img1 = formdata.get("image1") as Blob;
    const img2 = formdata.get("image2") as Blob;
    const img3 = formdata.get("image3") as Blob;
    const img4 = formdata.get("image4") as Blob;

    if (
      !title ||
      !description ||
      !price ||
      !stock ||
      !category ||
      !img1 ||
      !img2 ||
      !img3 ||
      !img4
    ) {
      return NextResponse.json(
        { message: "All fields & 4 images required" },
        { status: 400 },
      );
    }

    if (isWearable && sizes.length === 0) {
      return NextResponse.json(
        { message: "Sizes are required for wearable product" },
        { status: 400 },
      );
    }
    const image1 = await uploadOnCloudinary(img1);
    const image2 = await uploadOnCloudinary(img2);
    const image3 = await uploadOnCloudinary(img3);
    const image4 = await uploadOnCloudinary(img4);
    const product = await Product.create({
      title,
      description,
      price,
      stock,
      isStockAvailable: stock > 0,
      image1,
      image2,
      image3,
      image4,
      category,
      vendor: session.user.id,
      isWearable,
      sizes: isWearable ? sizes : [],
      replacementDays,
      warranty,
      payOnDelivery,
      freeDelivery,
      detailPoints,
      verificationStatus: "pending",
      isActive: false,
    });
    await User.findByIdAndUpdate(
      session.user.id,
      {
        $push: { vendorProducts: product._id },
      },
      { new: true },
    );
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: `failed to create new product ${error}` },
      { status: 500 },
    );
  }
}
