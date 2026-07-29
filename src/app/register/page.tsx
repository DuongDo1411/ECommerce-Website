'use client'
import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { ClipLoader } from 'react-spinners';
import { signIn } from 'next-auth/react';
import { ToastContainer, type ToastData } from '../component/Toast';

function Register() {
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState<ToastData | null>(null);

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await axios.post("/api/auth/register", { name, email, password });
            setLoading(false);
            setEmail("");
            setName("");
            setPassword("");
            // A vendor sign-up lands on the user login, then continues into the
            // "open shop" flow after authenticating. Role is only ever changed
            // server-side by /api/user/become-vendor.
            const intent = new URLSearchParams(window.location.search).get("intent");
            const next =
                intent === "vendor"
                    ? "/login?callbackUrl=%2Fbecome-vendor"
                    : "/login";
            setToast({ message: "Đăng ký thành công! Đang chuyển đến trang đăng nhập...", type: "success" });
            setTimeout(() => router.push(next), 1800);
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

    return (
        <div className='relative min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white p-6 overflow-hidden'>
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none" />

            <AnimatePresence mode='wait'>
                <motion.div
                    key="register"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -30 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className='relative z-10 w-full max-w-md bg-white/5 backdrop-blur-xl rounded-4xl shadow-2xl p-8 sm:p-10 border border-white/10'
                >
                    <h1 className='text-3xl font-bold mb-8 text-center text-white'>
                        Tạo tài khoản
                    </h1>

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

                        <p className='text-center text-sm mt-4 text-gray-400'>
                            Đã có tài khoản?{" "}
                            <span
                                onClick={() => router.push("/login")}
                                className='text-blue-400 hover:text-blue-300 font-medium hover:underline cursor-pointer transition-colors'
                            >
                                Đăng nhập
                            </span>
                        </p>
                    </form>
                </motion.div>
            </AnimatePresence>

            <ToastContainer toast={toast} onClose={() => setToast(null)} />
        </div>
    )
}

export default Register
