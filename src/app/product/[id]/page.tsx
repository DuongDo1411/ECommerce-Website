import connectDB from "@/lib/connectDB";
import { sellableProductFilter } from "@/lib/sellable";
import Product from "@/model/product.model";
import { notFound } from "next/navigation";
import Navbar from "@/app/component/Navbar";
import Footer from "@/app/component/Footer";
import { auth } from "@/auth";
import User from "@/model/user.model";
import ProductDetailClient from "./ProductDetailClient";
import mongoose from "mongoose";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Tham số động trong URL là chuỗi do người lạ đưa vào. Đưa thẳng nó vào _id thì Mongoose ném
  // CastError chứ không trả về null, nên nhánh notFound() bên dưới KHÔNG BAO GIỜ chạy tới và
  // người dùng nhận 500 kèm trang lỗi chung thay vì 404. Mã trông như đã phòng ngừa mà không.
  //
  // Đã xảy ra thật ở production với /product/abc. Bot quét web, liên kết cũ bị cắt ngắn, hay
  // một lần gõ tay sai là đủ. Chặn ở đây, trước cả connectDB, vì id sai thì không cần tới DB.
  if (!mongoose.Types.ObjectId.isValid(id)) notFound();

  await connectDB();

  const product = await Product.findOne({
    ...(await sellableProductFilter()),
    _id: id,
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
