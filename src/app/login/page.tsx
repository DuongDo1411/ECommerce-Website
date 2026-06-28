import { Suspense } from 'react'
import LoginFallback from '../component/Auth/LoginFallback'
import LoginForm from '../component/Auth/LoginForm'

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm
        showGoogle
        showRegister
        title="Welcome Back To MultiCart"
        registerLabel="Register"
        registerHref="/register"
      />
    </Suspense>
  )
}
