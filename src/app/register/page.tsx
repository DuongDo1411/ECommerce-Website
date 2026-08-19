import { redirect } from "next/navigation";

import RegisterForm from "../component/Auth/RegisterForm";

/**
 * Cổng đăng ký Người mua.
 *
 * `?intent=vendor` là đường dẫn cũ, từ thời mở shop chỉ là đổi vai của một tài khoản sẵn có.
 * Giờ nó phải chuyển hẳn sang cổng Người bán: nếu cứ render form người mua, người bấm liên
 * kết cũ sẽ lặng lẽ tạo một tài khoản mua hàng rồi tưởng mình đã đăng ký bán hàng.
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if ((await searchParams).intent === "vendor") redirect("/vendor/register");

  return <RegisterForm portal="user" />;
}
