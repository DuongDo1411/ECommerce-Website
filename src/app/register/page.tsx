'use client'
import React, { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { TbPlayerTrackNext } from "react-icons/tb";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { ClipLoader } from 'react-spinners';
import { signIn } from 'next-auth/react';

function Register() {
    const [step, setStep] = useState<1 | 2>(1)
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const result = await axios.post("/api/auth/register", {
                name,
                email,
                password,
            });
            console.log(result.data);
            setLoading(false);
            setEmail("");
            setName("");
            setPassword("");
            router.push("/login");
        } catch (error) {
            console.log(error);
            setLoading(false);
        }
    };

    return (
        <div className='relative min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white p-6 overflow-hidden'>
            {/* Background Glow Effects (Modern Minimalist vibe) */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none" />

            <AnimatePresence mode='wait'>
                {/* --- BƯỚC 1: CHỌN TÀI KHOẢN --- */}
                {step === 1 &&
                    <motion.div
                        key="step1"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -30, scale: 0.95 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                        className='relative z-10 w-full max-w-lg text-center bg-white/5 backdrop-blur-xl rounded-4xl shadow-2xl p-8 sm:p-10 border border-white/10'
                    >
                        <h1 className='text-3xl sm:text-4xl font-bold mb-3 bg-linear-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent'>
                            Welcome to MultiCart
                        </h1>
                        <p className='text-gray-400 mb-8 text-sm sm:text-base'>
                            Vui lòng chọn loại tài khoản để bắt đầu
                        </p>
                        
                        <div className='grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8'>
                            {[
                                { label: "User", icon: "👤", color: "from-blue-500/20 to-cyan-500/20 border-blue-500/30", value: "User" },
                                { label: "Seller", icon: "🏪", color: "from-purple-500/20 to-pink-500/20 border-purple-500/30", value: "Vendor" },
                                { label: "Admin", icon: "🛡️", color: "from-red-500/20 to-yellow-500/20 border-red-500/30", value: "Admin" },
                            ].map((item) => (
                                <motion.div
                                    key={item.value}
                                    whileHover={{ scale: 1.05, y: -5 }}
                                    whileTap={{ scale: 0.95 }}
                                    className={`bg-linear-to-br ${item.color} border p-6 rounded-2xl cursor-pointer shadow-lg hover:shadow-xl transition-all flex flex-col items-center justify-center gap-2`}
                                >
                                    <span className='text-4xl'>{item.icon}</span>
                                    <span className='text-sm font-semibold tracking-wide text-gray-200'>{item.value}</span>
                                </motion.div>
                            ))}
                        </div>

                        <motion.button
                            onClick={() => setStep(2)}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className='w-full py-4 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] transition-all'
                        >
                            Tiếp tục <TbPlayerTrackNext size={20} />
                        </motion.button>
                    </motion.div>
                }

                {/* --- BƯỚC 2: NHẬP THÔNG TIN --- */}
                {step === 2 &&
                    <motion.div
                        key="step2"
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
                            {/* Input Name */}
                            <input
                                type="text"
                                required
                                placeholder='Họ và tên'
                                onChange={(e) => setName(e.target.value)}
                                value={name}
                                className='w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all'
                            />
                            
                            {/* Input Email */}
                            <input
                                type="email"
                                required
                                placeholder='Email'
                                onChange={(e) => setEmail(e.target.value)}
                                value={email}
                                className='w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all'
                            />
                            
                            {/* Input Password (Fixed Position for Icon) */}
                            <div className='relative w-full'>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    required
                                    placeholder='Mật khẩu'
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

                            {/* Nút Đăng Ký */}
                            <motion.button
                                disabled={loading}
                                type='submit'
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className='mt-2 w-full py-4 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all disabled:opacity-70 disabled:cursor-not-allowed'
                            >
                                {loading ? <ClipLoader color='white' size={24} /> : "Đăng ký"}
                            </motion.button>

                            {/* Divider */}
                            <div className='flex items-center my-2'>
                                <div className='flex-1 h-px bg-white/10'></div>
                                <span className='px-4 text-sm text-gray-500'>Hoặc</span>
                                <div className='flex-1 h-px bg-white/10'></div>
                            </div>

                            {/* Nút Google */}
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
                }
            </AnimatePresence>
        </div>
    )
}

export default Register