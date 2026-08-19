import RegisterForm from "../../component/Auth/RegisterForm";

/**
 * Cổng đăng ký Người bán. Tài khoản người bán là tài khoản riêng, tách hẳn khỏi tài khoản
 * mua hàng, nên nó phải dùng một email chưa từng đăng ký — `emailNormalized` là khoá duy
 * nhất trên `users`, và chính index đó thực thi ràng buộc này.
 */
export default function VendorRegisterPage() {
  return <RegisterForm portal="vendor" />;
}
