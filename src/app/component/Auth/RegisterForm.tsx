'use client'
import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { ClipLoader } from 'react-spinners';
import { signIn } from 'next-auth/react';
import { ToastContainer, type ToastData } from '../Toast';
import { REGISTRATION_LAST_SENT_AT_STORAGE_KEY } from '@/lib/security/fragmentSecret';

/** Khớp cooldown 60 giây mà server áp cho mỗi địa chỉ email. */
const RESEND_COOLDOWN_MS = 60_000;

export type RegisterPortal = "user" | "vendor";

/**
 * Cấu hình riêng của từng cổng đăng ký.
 *
 * Gộp hai cổng vào một component là có chủ ý, theo đúng khuôn `LoginForm` đang phục vụ cả ba
 * cổng đăng nhập qua một prop: cooldown 60 giây, panel "kiểm tra hộp thư" và cách xử lý lỗi
 * chỉ tồn tại ở một chỗ. Nhân bản thành hai trang thì hai bản lệch nhau ngay lần sửa quy tắc
 * đầu tiên, và cái lệch đó không có gì báo động.
 */
const PORTALS: Record<
  RegisterPortal,
  {
    title: string;
    note: string;
    loginHref: string;
    loginLabel: string;
    showGoogle: boolean;
    intent?: "vendor";
  }
> = {
  user: {
    title: "Tạo tài khoản",
    note: "",
    loginHref: "/login",
    loginLabel: "Đăng nhập",
    showGoogle: true,
  },
  vendor: {
    title: "Đăng ký mở shop",
    // Nói trước để người dùng không mất một lượt đăng ký mới biết: email đã có tài khoản mua
    // hàng sẽ bị từ chối, vì `emailNormalized` là khoá duy nhất trên `users`.
    note: "Tài khoản người bán là tài khoản riêng và phải dùng email chưa từng đăng ký trên MultiCart. Sau khi kích hoạt, bạn đăng nhập ở cổng Người bán để khai hồ sơ cửa hàng và chờ quản trị viên duyệt.",
    loginHref: "/vendor/login",
    loginLabel: "Đăng nhập cổng Người bán",
    showGoogle: false,
    intent: "vendor",
  },
};

function RegisterForm({ portal }: { portal: RegisterPortal }) {
    const config = PORTALS[portal];
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState<ToastData | null>(null);
    // Email của lượt đăng ký vừa gửi. Rỗng nghĩa là đang ở bước điền form.
    const [pendingEmail, setPendingEmail] = useState('');
    const [cooldown, setCooldown] = useState(0);
    const [resending, setResending] = useState(false);

    const startCooldown = useCallback(() => {
        window.sessionStorage.setItem(
            REGISTRATION_LAST_SENT_AT_STORAGE_KEY,
            String(Date.now()),
        );
        setCooldown(Math.ceil(RESEND_COOLDOWN_MS / 1000));
    }, []);

    // Phục hồi cooldown sau khi tải lại trang. Đây chỉ là phép lịch sự với người dùng để nút
    // không mời bấm một cách vô ích; nguồn kiểm soát thật vẫn là hạn mức phía server, vì
    // sessionStorage thì người dùng xoá được.
    useEffect(() => {
        const raw = window.sessionStorage.getItem(REGISTRATION_LAST_SENT_AT_STORAGE_KEY);
        const lastSentAt = raw ? Number(raw) : NaN;
        if (!Number.isFinite(lastSentAt)) return;
        const remaining = RESEND_COOLDOWN_MS - (Date.now() - lastSentAt);
        if (remaining > 0) setCooldown(Math.ceil(remaining / 1000));
    }, []);

    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
        return () => clearTimeout(timer);
    }, [cooldown]);

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            // `intent` đến từ cổng đang mở, không từ query string. Nó chỉ là ĐỀ NGHỊ: loại tài
            // khoản thật do bản ghi chờ phía server quyết định lúc kích hoạt.
            await axios.post("/api/auth/register", {
                name,
                email,
                password,
                ...(config.intent ? { intent: config.intent } : {}),
            });
            setLoading(false);
            // Giữ email để hiện trong panel và để nút gửi lại dùng; xoá mật khẩu khỏi state
            // ngay vì từ đây trở đi không còn cần tới nó nữa.
            setPendingEmail(email);
            setPassword("");
            setName("");
            startCooldown();
        } catch (error: unknown) {
            console.log(error);
            setLoading(false);
            const msg =
                axios.isAxiosError(error) && error.response?.data?.message
                    ? error.response.data.message
                    : "Đăng ký thất bại. Vui lòng thử lại.";
            setToast({ message: msg, type: "error" });
        }
    };

    const handleResend = async () => {
        setResending(true);
        try {
            const res = await axios.post("/api/auth/register/resend", { email: pendingEmail });
            setToast({
                message: (res.data as { message?: string })?.message
                    ?? "Nếu email đang chờ kích hoạt, chúng tôi đã gửi lại liên kết.",
                type: "success",
            });
            startCooldown();
        } catch (error: unknown) {
            const msg =
                axios.isAxiosError(error) && error.response?.data?.message
                    ? error.response.data.message
                    : "Không gửi lại được lúc này.";
            setToast({ message: msg, type: "error" });
        } finally {
            setResending(false);
        }
    };

    return (
        <div className='relative min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white p-6 overflow-hidden'>
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none" />

            <AnimatePresence mode='wait'>
                {pendingEmail ? (
                    <motion.div
                        key="check-inbox"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -30 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                        className='relative z-10 w-full max-w-md bg-white/5 backdrop-blur-xl rounded-4xl shadow-2xl p-8 sm:p-10 border border-white/10'
                    >
                        <h1 className='text-3xl font-bold mb-4 text-center text-white'>
                            Kiểm tra hộp thư
                        </h1>
                        <p className='text-gray-300 text-sm text-center mb-2'>
                            Chúng tôi đã gửi liên kết kích hoạt tới
                        </p>
                        <p className='text-blue-300 font-medium text-center mb-6 break-all'>
                            {pendingEmail}
                        </p>
                        <p className='text-gray-400 text-sm mb-8'>
                            Bấm liên kết trong email để hoàn tất đăng ký. Liên kết có hiệu lực 24 giờ.
                            Tài khoản chỉ được tạo sau khi bạn bấm liên kết đó.
                        </p>

                        <button
                            onClick={handleResend}
                            disabled={resending || cooldown > 0}
                            className='w-full py-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed'
                        >
                            {resending
                                ? "Đang gửi…"
                                : cooldown > 0
                                    ? `Gửi lại sau ${cooldown}s`
                                    : "Gửi lại liên kết"}
                        </button>

                        <button
                            onClick={() => router.push(config.loginHref)}
                            className='mt-3 w-full py-4 bg-white/5 border border-white/10 rounded-xl font-medium text-gray-200 transition-all'
                        >
                            Về trang đăng nhập
                        </button>
                    </motion.div>
                ) : (
                    <motion.div
                        key="register"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -30 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                        className='relative z-10 w-full max-w-md bg-white/5 backdrop-blur-xl rounded-4xl shadow-2xl p-8 sm:p-10 border border-white/10'
                    >
                        <h1 className='text-3xl font-bold mb-4 text-center text-white'>
                            {config.title}
                        </h1>

                        {config.note && (
                            <p className='text-gray-400 text-sm mb-6'>{config.note}</p>
                        )}

                        <form onSubmit={handleSignUp} className='flex flex-col gap-5'>
                            <input
                                type="text"
                                required
                                placeholder='Họ và tên'
                                onChange={(e) => setName(e.target.value)}
                                value={name}
                                className='w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all'
                            />

                            <input
                                type="email"
                                required
                                placeholder='Email'
                                onChange={(e) => setEmail(e.target.value)}
                                value={email}
                                className='w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all'
                            />

                            <div className='relative w-full'>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    required
                                    placeholder='Mật khẩu (tối thiểu 12 ký tự)'
                                    onChange={(e) => setPassword(e.target.value)}
                                    value={password}
                                    className='w-full bg-white/5 border border-white/10 rounded-xl p-4 pr-12 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all'
                                />
                                <button
                                    type='button'
                                    onClick={() => setShowPassword(!showPassword)}
                                    className='absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors flex items-center justify-center'
                                >
                                    {showPassword ? <FaEyeSlash size={20} /> : <FaEye size={20} />}
                                </button>
                            </div>

                            <motion.button
                                disabled={loading}
                                type='submit'
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className='mt-2 w-full py-4 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all disabled:opacity-70 disabled:cursor-not-allowed'
                            >
                                {loading ? <ClipLoader color='white' size={24} /> : "Đăng ký"}
                            </motion.button>

                            {/* Cổng Người bán KHÔNG có Google: tài khoản người bán phải có mật khẩu
                                riêng, và cửa Google chỉ tạo được tài khoản người mua. */}
                            {config.showGoogle && (
                                <>
                                    <div className='flex items-center my-2'>
                                        <div className='flex-1 h-px bg-white/10'></div>
                                        <span className='px-4 text-sm text-gray-500'>Hoặc</span>
                                        <div className='flex-1 h-px bg-white/10'></div>
                                    </div>

                                    <motion.button
                                        type="button"
                                        onClick={() => signIn("google", { callbackUrl: "/" })}
                                        whileHover={{ scale: 1.02, backgroundColor: "rgba(255, 255, 255, 0.1)" }}
                                        whileTap={{ scale: 0.98 }}
                                        className='w-full flex items-center justify-center gap-3 py-4 bg-white/5 border border-white/10 rounded-xl transition-all'
                                    >
                                        <FcGoogle size={24} />
                                        <span className='font-medium text-gray-200'>Tiếp tục với Google</span>
                                    </motion.button>
                                </>
                            )}

                            <p className='text-center text-sm mt-4 text-gray-400'>
                                Đã có tài khoản?{" "}
                                <span
                                    onClick={() => router.push(config.loginHref)}
                                    className='text-blue-400 hover:text-blue-300 font-medium hover:underline cursor-pointer transition-colors'
                                >
                                    {config.loginLabel}
                                </span>
                            </p>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            <ToastContainer toast={toast} onClose={() => setToast(null)} />
        </div>
    )
}

export default RegisterForm
