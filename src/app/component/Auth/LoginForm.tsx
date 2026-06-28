'use client'
import { motion, AnimatePresence } from 'motion/react'
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react'
import { ClipLoader } from 'react-spinners'
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { signIn, signOut, getSession } from 'next-auth/react';
import { ToastContainer, type ToastData } from '../Toast';
import { homeForRole, safeCallbackPath } from '@/lib/roleRoutes';

type AllowedRole = "vendor" | "admin";

interface LoginFormProps {
  /** When set, only this role may sign in here; other roles are rejected + signed out. */
  allowedRole?: AllowedRole;
  showGoogle?: boolean;
  showRegister?: boolean;
  title?: string;
  subtitle?: string;
  registerLabel?: string;
  registerHref?: string;
}

export default function LoginForm({
  allowedRole,
  showGoogle = false,
  showRegister = false,
  title = "Đăng nhập",
  subtitle = "Vui lòng đăng nhập để tiếp tục",
  registerLabel = "Register",
  registerHref = "/register",
}: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

  const callbackTarget = () =>
    safeCallbackPath(searchParams.get("callbackUrl"));

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (!result?.ok || result.error) {
        setToast({ message: "Email hoặc mật khẩu không đúng. Vui lòng thử lại.", type: "error" });
        setLoading(false);
        return;
      }

      // Read the freshly established session to decide where to go / whether the
      // role is allowed at this portal.
      const session = await getSession();
      const role = session?.user?.role;

      if (!session?.user?.id || typeof role !== "string") {
        await signOut({ redirect: false });
        setToast({
          message: "Phiên đăng nhập không hợp lệ. Vui lòng thử lại.",
          type: "error",
        });
        setLoading(false);
        return;
      }

      if (allowedRole && role !== allowedRole) {
        await signOut({ redirect: false });
        setToast({
          message: "Tài khoản này không có quyền truy cập cổng đăng nhập này.",
          type: "error",
        });
        setLoading(false);
        return;
      }

      const destination = allowedRole
        ? homeForRole(role)
        : (callbackTarget() ?? homeForRole(role));

      setToast({ message: "Đăng nhập thành công! Đang chuyển trang...", type: "success" });
      setTimeout(() => router.push(destination), 1200);
    } catch (error) {
      console.log(error);
      setToast({ message: "Đã có lỗi xảy ra. Vui lòng thử lại.", type: "error" });
      setLoading(false);
    }
  }

  const handleGoogle = () => {
    // Google accounts are always created as "user"; only offered on the public portal.
    signIn("google", { redirectTo: callbackTarget() ?? "/" });
  };

  return (
    <div className='min-h-screen flex items-center justify-center bg-linear-to-br from-gray-900 via-[#0a0a0a] to-gray-900 text-white p-6'>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -40 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className='w-full max-w-md bg-white/3 backdrop-blur-xl rounded-3xl shadow-[0_0_40px_rgba(0,0,0,0.5)] p-8 sm:p-10 border border-white/10'
        >
          <div className='mb-8 text-center'>
            <h1 className='text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-linear-to-r from-blue-400 to-cyan-400'>
              {title}
            </h1>
            <p className='text-gray-400 text-sm mt-2'>{subtitle}</p>
          </div>

          <form onSubmit={handleSignIn} className='flex flex-col gap-5'>
            {/* Email Input */}
            <div className='relative'>
              <input
                type="email"
                required
                className='w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:bg-white/10 transition-all duration-300'
                placeholder='Email address'
                onChange={(e) => setEmail(e.target.value)} value={email}
              />
            </div>

            {/* Password Input */}
            <div className='relative w-full'>
              <input
                type={showPassword ? "text" : "password"}
                required
                className='w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 pr-12 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:bg-white/10 transition-all duration-300'
                placeholder='Password'
                onChange={(e) => setPassword(e.target.value)} value={password}
              />
              <button
                type='button'
                onClick={() => setShowPassword(!showPassword)}
                className='absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors duration-200'
              >
                {showPassword ? <FaEyeSlash size={20} /> : <FaEye size={20} />}
              </button>
            </div>

            {/* Submit Button */}
            <motion.button
              disabled={loading}
              type='submit'
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className='mt-2 px-8 py-3.5 flex items-center justify-center gap-2 bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 rounded-xl font-semibold w-full text-white shadow-lg shadow-blue-500/30 transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed'
            >
              {loading ? <ClipLoader color='white' size={20} /> : "Đăng nhập"}
            </motion.button>

            {showGoogle && (
              <>
                {/* Divider */}
                <div className='flex items-center my-2'>
                  <div className='flex-1 h-px bg-linear-to-r from-transparent via-gray-600 to-gray-600'></div>
                  <span className='px-4 text-sm text-gray-400 font-medium'>or</span>
                  <div className='flex-1 h-px bg-linear-to-l from-transparent via-gray-600 to-gray-600'></div>
                </div>

                {/* Google Button */}
                <motion.button
                  type="button"
                  onClick={handleGoogle}
                  whileHover={{ scale: 1.02, backgroundColor: "rgba(255,255,255,0.15)" }}
                  whileTap={{ scale: 0.98 }}
                  className='flex items-center justify-center gap-3 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all duration-300'
                >
                  <FcGoogle size={22} />
                  <span className='font-medium text-gray-200'>Login with Google</span>
                </motion.button>
              </>
            )}

            {showRegister && (
              <p className='text-center text-sm mt-2 text-gray-400'>
                Don&apos;t have an account?{" "}
                <span
                  onClick={() => router.push(registerHref)}
                  className='text-blue-400 font-medium hover:text-blue-300 hover:underline cursor-pointer transition-colors'
                >
                  {registerLabel}
                </span>
              </p>
            )}
          </form>
        </motion.div>
      </AnimatePresence>

      {/* ── Toast notification ── */}
      <ToastContainer toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}
