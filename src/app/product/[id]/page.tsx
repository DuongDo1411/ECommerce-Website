import connectDB from "@/lib/connectDB";
import Product from "@/model/product.model";
import { notFound } from "next/navigation";
import Navbar from "@/app/component/Navbar";
import Footer from "@/app/component/Footer";
import { auth } from "@/auth";
import User from "@/model/user.model";
import ProductDetailClient from "./ProductDetailClient";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  await connectDB();

  const product = await Product.findOne({
    _id: id,
    isActive: true,
    verificationStatus: "approved",
  }).populate("vendor", "name email shopName shopAddress image");

  if (!product) {
    notFound();
  }

  // Populate thông tin user trong từng review
  await product.populate("reviews.user", "name image");

  const session = await auth();
  const user = session?.user?.id
    ? await User.findById(session.user.id)
    : null;
  const plainUser = user ? JSON.parse(JSON.stringify(user)) : null;
  const plainProduct = JSON.parse(JSON.stringify(product));

  return (
    <div className="flex min-h-screen flex-col bg-gray-950">
      {plainUser && <Navbar user={plainUser} />}
      <main className="flex-1 pt-16">
        <ProductDetailClient product={plainProduct} />
      </main>
      {plainUser && <Footer user={plainUser} />}
    </div>
  );
}
