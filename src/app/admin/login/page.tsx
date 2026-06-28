import { Suspense } from 'react'
import LoginFallback from '../../component/Auth/LoginFallback'
import LoginForm from '../../component/Auth/LoginForm'

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm
        allowedRole="admin"
        title="Đăng nhập Quản trị"
        subtitle="Khu vực quản trị hệ thống"
      />
    </Suspense>
  )
}
