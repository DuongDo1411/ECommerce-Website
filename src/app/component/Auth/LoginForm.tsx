'use client'
import { motion, AnimatePresence } from 'motion/react'
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react'
import { ClipLoader } from 'react-spinners'
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { signIn, signOut, getSession } from 'next-auth/react';
import { ToastContainer, type ToastData } from '../Toast';
import BackHomeBrand from '../BackHomeBrand';
import { credentialProviderForRole, homeForRole, safeCallbackPath, type LoginRole } from '@/lib/roleRoutes';

interface LoginFormProps {
  /** Which login portal this form is for. Required — it drives both the
   *  credentials provider used and the post-sign-in role check. */
  allowedRole: LoginRole;
  /**
   * When true, honour a safe `?callbackUrl=` after a successful sign-in.
   * Defaults to false so vendor/admin portals always land on their dashboard.
   */
  respectCallbackUrl?: boolean;
  showGoogle?: boolean;
  showRegister?: boolean;
  title?: string;
  subtitle?: string;
  registerLabel?: string;
  registerHref?: string;
}

export default function LoginForm({
  allowedRole,
  respectCallbackUrl = false,
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
  const [loading, setLoading] = useState(false);
  // Admin logs in directly (no OTP); User/Vendor run the initiate → OTP → grant
  // handshake so email 2FA can be enforced server-side.
  const isAdmin = allowedRole === "admin";
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [challengeId, setChallengeId] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [toast, setToast] = useState<ToastData | null>(() =>
    searchParams.get("error") === "RolePortalMismatch"
      ? {
          message:
            "Tài khoản Người bán/Quản trị không thể đăng nhập bằng Google tại đây. Vui lòng dùng cổng đăng nhập riêng.",
          type: "error",
        }
      : null,
  );

  const callbackTarget = () => safeCallbackPath(searchParams.get("callbackUrl"));

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(
      () => setResendIn((seconds) => (seconds > 0 ? seconds - 1 : 0)),
      1000,
    );
    return () => clearInterval(timer);
  }, [resendIn]);

  // Reads the freshly established session, enforces the role, then routes.
  const finishAfterSession = async () => {
    const session = await getSession();
    const role = session?.user?.role;
    if (!session?.user?.id || typeof role !== "string") {
      await signOut({ redirect: false });
      setToast({ message: "Phiên đăng nhập không hợp lệ. Vui lòng thử lại.", type: "error" });
      setLoading(false);
      return;
    }
    if (role !== allowedRole) {
      // Defence in depth; use the same generic message as bad credentials.
      await signOut({ redirect: false });
      setToast({ message: "Email hoặc mật khẩu không đúng. Vui lòng thử lại.", type: "error" });
      setLoading(false);
      return;
    }
    const destination = respectCallbackUrl
      ? (callbackTarget() ?? homeForRole(role))
      : homeForRole(role);
    setToast({ message: "Đăng nhập thành công! Đang chuyển trang...", type: "success" });
    setTimeout(() => router.push(destination), 1200);
  };

  // User/Vendor: trade the one-time grant for a session.
  const finishSignIn = async (loginGrant: string) => {
    const result = await signIn(credentialProviderForRole(allowedRole), {
      loginGrant,
      redirect: false,
    });
    if (!result?.ok || result.error) {
      setToast({ message: "Không thể hoàn tất đăng nhập. Vui lòng thử lại.", type: "error" });
      setLoading(false);
      return;
    }
    await finishAfterSession();
  };

  const handleAdminSignIn = async () => {
    const result = await signIn(credentialProviderForRole(allowedRole), {
      email,
      password,
      redirect: false,
    });
    if (!result?.ok || result.error) {
      setToast({ message: "Email hoặc mật khẩu không đúng. Vui lòng thử lại.", type: "error" });
      setLoading(false);
      return;
    }
    await finishAfterSession();
  };

  const handleInitiate = async () => {
    const res = await fetch("/api/auth/login/initiate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, role: allowedRole }),
    });
    if (res.status === 429) {
      setToast({ message: "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.", type: "error" });
      setLoading(false);
      return;
    }
    if (res.status === 503) {
      setToast({ message: "Không gửi được mã xác thực. Vui lòng thử lại.", type: "error" });
      setLoading(false);
      return;
    }
    if (!res.ok) {
      setToast({ message: "Email hoặc mật khẩu không đúng. Vui lòng thử lại.", type: "error" });
      setLoading(false);
      return;
    }
    const data = await res.json();
    if (data.step === "otp") {
      setChallengeId(data.challengeId);
      setPassword(""); // never keep the password in client state past initiate
      setOtpCode("");
      setStep("otp");
      setResendIn(60);
      setToast({ message: "Mã xác thực đã được gửi tới email của bạn.", type: "success" });
      setLoading(false);
      return;
    }
    if (data.step === "ready" && typeof data.loginGrant === "string") {
      await finishSignIn(data.loginGrant);
      return;
    }
    setToast({ message: "Đã có lỗi xảy ra. Vui lòng thử lại.", type: "error" });
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setToast(null);
    try {
      if (isAdmin) await handleAdminSignIn();
      else await handleInitiate();
    } catch (error) {
      console.log(error);
      setToast({ message: "Đã có lỗi xảy ra. Vui lòng thử lại.", type: "error" });
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(otpCode)) return;
    setLoading(true);
    setToast(null);
    try {
      const res = await fetch("/api/auth/login/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, code: otpCode }),
      });
      if (!res.ok) {
        setToast({
          message:
            res.status === 429
              ? "Bạn đã nhập sai quá nhiều lần. Hãy đăng nhập lại sau."
              : "Mã xác thực không đúng hoặc đã hết hạn.",
          type: "error",
        });
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (typeof data.loginGrant === "string") {
        await finishSignIn(data.loginGrant);
      } else {
        setToast({ message: "Đã có lỗi xảy ra. Vui lòng thử lại.", type: "error" });
        setLoading(false);
      }
    } catch (error) {
      console.log(error);
      setToast({ message: "Đã có lỗi xảy ra. Vui lòng thử lại.", type: "error" });
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendIn > 0) return;
    try {
      const res = await fetch("/api/auth/login/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId }),
      });
      if (res.ok) {
        setResendIn(60);
        setToast({ message: "Đã gửi lại mã tới email của bạn.", type: "success" });
      } else if (res.status === 404) {
        setToast({ message: "Phiên đã hết hạn. Vui lòng đăng nhập lại.", type: "error" });
        backToCredentials();
      } else if (res.status === 429) {
        const retry = Number(res.headers.get("Retry-After")) || 60;
        setResendIn(retry);
        setToast({ message: `Vui lòng chờ ${retry}s trước khi gửi lại.`, type: "error" });
      } else {
        setToast({ message: "Không gửi lại được mã. Vui lòng thử lại.", type: "error" });
      }
    } catch {
      setToast({ message: "Không gửi lại được mã. Vui lòng thử lại.", type: "error" });
    }
  };

  const backToCredentials = () => {
    setStep("credentials");
    setOtpCode("");
    setChallengeId("");
    setToast(null);
  };

  const handleGoogle = () => {
    signIn("google", {
      redirectTo: respectCallbackUrl ? (callbackTarget() ?? "/") : "/",
    });
  };

  const inputCls =
    'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 focus:bg-white/10 transition-all duration-300';

  return (
    <div className='min-h-screen flex items-center justify-center bg-linear-to-br from-gray-900 via-[#0a0a0a] to-gray-900 text-white p-6'>
      <BackHomeBrand />
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
              {step === "otp" ? "Xác minh 2 bước" : title}
            </h1>
            <p className='text-gray-400 text-sm mt-2'>
              {step === "otp"
                ? "Nhập mã 6 chữ số vừa gửi tới email của bạn"
                : subtitle}
            </p>
          </div>

          {step === "otp" ? (
            <form onSubmit={handleVerifyOtp} className='flex flex-col gap-5'>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                className={`${inputCls} text-center tracking-[0.5em]`}
                placeholder="______"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
              />
              <motion.button
                disabled={loading || otpCode.length !== 6}
                type='submit'
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className='mt-1 px-8 py-3.5 flex items-center justify-center gap-2 bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 rounded-xl font-semibold w-full text-white shadow-lg shadow-blue-500/30 transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed'
              >
                {loading ? <ClipLoader color='white' size={20} /> : "Xác nhận"}
              </motion.button>

              <div className='flex items-center justify-between text-sm'>
                <button
                  type='button'
                  onClick={backToCredentials}
                  className='text-gray-400 hover:text-white transition-colors'
                >
                  ← Quay lại
                </button>
                <button
                  type='button'
                  onClick={handleResend}
                  disabled={resendIn > 0}
                  className='text-blue-400 hover:text-blue-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors'
                >
                  {resendIn > 0 ? `Gửi lại sau ${resendIn}s` : "Gửi lại mã"}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className='flex flex-col gap-5'>
              <div className='relative'>
                <input
                  type="email"
                  required
                  className={inputCls}
                  placeholder='Email address'
                  onChange={(e) => setEmail(e.target.value)} value={email}
                />
              </div>

              <div className='relative w-full'>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  className={`${inputCls} pr-12`}
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

              <div className='text-right -mt-2'>
                <span
                  onClick={() => router.push("/forgot-password")}
                  className='text-xs text-gray-400 hover:text-blue-300 cursor-pointer transition-colors'
                >
                  Quên mật khẩu?
                </span>
              </div>

              <motion.button
                disabled={loading}
                type='submit'
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className='mt-1 px-8 py-3.5 flex items-center justify-center gap-2 bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 rounded-xl font-semibold w-full text-white shadow-lg shadow-blue-500/30 transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed'
              >
                {loading ? <ClipLoader color='white' size={20} /> : "Đăng nhập"}
              </motion.button>

              {showGoogle && (
                <>
                  <div className='flex items-center my-2'>
                    <div className='flex-1 h-px bg-linear-to-r from-transparent via-gray-600 to-gray-600'></div>
                    <span className='px-4 text-sm text-gray-400 font-medium'>or</span>
                    <div className='flex-1 h-px bg-linear-to-l from-transparent via-gray-600 to-gray-600'></div>
                  </div>

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
          )}
        </motion.div>
      </AnimatePresence>

      <ToastContainer toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}
