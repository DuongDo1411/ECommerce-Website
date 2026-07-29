'use client'
import axios from 'axios';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';
import { AiOutlinePhone } from 'react-icons/ai';
import { ClipLoader } from 'react-spinners';

/**
 * Phone-only profile completion shown when a signed-in account is missing its
 * pickup phone. Role is never chosen here — becoming a vendor goes through the
 * dedicated "/become-vendor" flow, so a client can never assign itself a role.
 */
function EditRole_Phone() {
    const [phone, setPhone] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!/^0\d{9}$/.test(phone.trim())) {
            alert("Số điện thoại không hợp lệ — phải gồm 10 chữ số và bắt đầu bằng 0 (VD: 0901234567). GHN dùng số này để liên hệ lấy hàng.");
            return;
        }
        setLoading(true);
        try {
            await axios.post("/api/user/phone", { phone: phone.trim() });
            // Re-render the server component so the completed profile is picked up.
            router.refresh();
        } catch (error) {
            const message = axios.isAxiosError<{ message?: string }>(error)
                ? error.response?.data?.message
                : undefined;
            alert(message ?? "Có lỗi xảy ra, vui lòng thử lại");
            console.log(error);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className='min-h-screen flex items-center justify-center bg-[#050505] text-white p-6 relative overflow-hidden'>
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px]" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[120px]" />

            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className='w-full max-w-xl bg-white/3 backdrop-blur-2xl rounded-[2.5rem] shadow-2xl p-8 sm:p-12 border border-white/10 z-10'
                >
                    <div className='text-center mb-10'>
                        <motion.h1
                            initial={{ y: -20 }}
                            animate={{ y: 0 }}
                            className='text-4xl sm:text-5xl font-bold bg-linear-to-r from-white via-blue-100 to-gray-500 bg-clip-text text-transparent mb-4'
                        >
                            Hoàn tất hồ sơ
                        </motion.h1>
                        <p className='text-gray-400 text-base sm:text-lg max-w-xs mx-auto'>
                            Nhập số điện thoại để tiếp tục sử dụng tài khoản
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className='space-y-8'>
                        <div className="relative group">
                            <AiOutlinePhone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                            <input
                                type="tel"
                                inputMode="numeric"
                                placeholder='Số điện thoại (VD: 0901234567)'
                                maxLength={10}
                                required
                                className='w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-white/10 transition-all placeholder:text-gray-600'
                                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                                value={phone}
                            />
                        </div>

                        <motion.button
                            disabled={loading}
                            type='submit'
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            className='w-full py-4 relative flex items-center justify-center overflow-hidden bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold text-lg shadow-lg shadow-blue-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed'
                        >
                            {loading ? (
                                <ClipLoader color='white' size={24} />
                            ) : (
                                <span className='flex items-center gap-2'>
                                    Tiếp tục <span className='text-xl'>→</span>
                                </span>
                            )}
                        </motion.button>
                    </form>
                </motion.div>
            </AnimatePresence>
        </div>
    )
}

export default EditRole_Phone;
