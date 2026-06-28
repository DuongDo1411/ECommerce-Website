import type { ClientSession } from "mongoose";
import Product from "@/model/product.model";
import { CheckoutError } from "./types";

// Trừ tồn kho atomic. Điều kiện nằm ngay trong filter nên hai request đồng thời
// không thể đẩy stock xuống âm: chỉ request thỏa `stock >= quantity` mới ghi được.
// Phải chạy trong `session` để cùng rollback với phần còn lại của transaction.
export async function deductStockAtomic(params: {
  productId: string;
  quantity: number;
  size?: string | null;
  session?: ClientSession;
}) {
  const { productId, quantity, size, session } = params;

  const result = size
    ? await Product.updateOne(
        {
          _id: productId,
          stock: { $gte: quantity },
          isStockAvailable: true,
          sizeStock: { $elemMatch: { size, stock: { $gte: quantity } } },
        },
        { $inc: { stock: -quantity, "sizeStock.$.stock": -quantity } },
        { session },
      )
    : await Product.updateOne(
        { _id: productId, stock: { $gte: quantity }, isStockAvailable: true },
        { $inc: { stock: -quantity } },
        { session },
      );

  if (result.modifiedCount !== 1) {
    throw new CheckoutError(
      "insufficient_stock",
      "Sản phẩm không đủ hàng",
      409,
      { productId, size: size ?? null },
    );
  }

  // Trừ kho chỉ làm tồn giảm: nếu về 0 thì tắt cờ còn hàng (atomic, cùng session).
  await Product.updateOne(
    { _id: productId, stock: { $lte: 0 } },
    { $set: { isStockAvailable: false } },
    { session },
  );
}
