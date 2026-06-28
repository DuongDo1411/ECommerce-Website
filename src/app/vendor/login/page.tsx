import { Suspense } from 'react'
import LoginFallback from '../../component/Auth/LoginFallback'
import LoginForm from '../../component/Auth/LoginForm'

export default function VendorLoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm
        allowedRole="vendor"
        showRegister
        title="Đăng nhập Người bán"
        subtitle="Cổng dành cho chủ shop"
        registerLabel="Đăng ký mở shop"
        registerHref="/register"
      />
    </Suspense>
  )
}
