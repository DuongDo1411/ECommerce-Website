'use client'
import axios from 'axios';
import { AnimatePresence, motion } from 'framer-motion'; 
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import { AiOutlineShop, AiOutlineTool, AiOutlineUser, AiOutlinePhone } from 'react-icons/ai';
import { ClipLoader } from 'react-spinners';

function EditRole_Phone() {
    const [role, setRole] = useState<string>("");
    const [phone, setPhone] = useState<string>("");
    const roles = [
        { label: "Admin", value: "admin", icon: <AiOutlineTool size={32} /> },
        { label: "Vendor", value: "vendor", icon: <AiOutlineShop size={32} /> },
        { label: "User", value: "user", icon: <AiOutlineUser size={32} /> },
    ];
    const [adminExist, setAdminExist] = useState(false);
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    useEffect(() => {
        const checkAdminExist = async () => {
            try {
                const res = await axios.get("/api/admin/check-admin");
                setAdminExist(res.data.exists);
            } catch (error) {
                setAdminExist(false);
                console.log(error);
            }
        }
        checkAdminExist();
    }, [])

    const handelSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!role || !phone) {
            alert("please select the role and enter the phone number");
            return;
        }
        setLoading(true);
        try {
            const result = await axios.post("api/user/edit-role-phone", { role, phone });
            alert(result.data.message);
            setLoading(false);
            router.push("/");
        } catch (error) {
            setLoading(false);
            console.log(error);
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
                            Setup Profile
                        </motion.h1>
                        <p className='text-gray-400 text-base sm:text-lg max-w-xs mx-auto'>
                            Complete your account details to get started
                        </p>
                    </div>

                    <form onSubmit={handelSubmit} className='space-y-8'>
                        {/* Input Section */}
                        <div className="relative group">
                            <AiOutlinePhone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                            <input
                                type="text"
                                placeholder='Enter your phone number'
                                maxLength={10}
                                required
                                className='w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-white/10 transition-all placeholder:text-gray-600'
                                onChange={(e) => setPhone(e.target.value)}
                                value={phone}
                            />
                        </div>

                        {/* Roles Selection */}
                        <div className='grid grid-cols-1 sm:grid-cols-3 gap-4'>
                            {roles.map((rol) => {
                                const isAdminBlocked = rol.value === "admin" && adminExist;
                                const isSelected = role === rol.value;

                                return (
                                    <motion.div
                                        key={rol.value}
                                        whileHover={!isAdminBlocked ? { y: -5, backgroundColor: "rgba(255,255,255,0.08)" } : {}}
                                        whileTap={!isAdminBlocked ? { scale: 0.98 } : {}}
                                        onClick={() => {
                                            if (isAdminBlocked) {
                                                alert("🚫 Admin already exists. You cannot select Admin role !!!");
                                                return;
                                            }
                                            setRole(rol.value);
                                        }}
                                        className={`relative overflow-hidden cursor-pointer p-6 rounded-2xl border transition-all duration-300 flex flex-col items-center gap-3
                                            ${isSelected 
                                                ? "border-blue-500 bg-blue-500/20 shadow-[0_0_25px_rgba(59,130,246,0.2)]" 
                                                : "border-white/5 bg-white/2"
                                            } 
                                            ${isAdminBlocked ? "opacity-30 cursor-not-allowed grayscale" : "hover:border-white/20"}`}
                                    >
                                        {/* Active Indicator Dot */}
                                        {isSelected && (
                                            <motion.div layoutId="dot" className="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full" />
                                        )}
                                        
                                        <div className={`${isSelected ? "text-blue-400" : "text-gray-400"} transition-colors`}>
                                            {rol.icon}
                                        </div>
                                        
                                        <span className={`text-sm font-semibold uppercase tracking-wider ${isSelected ? "text-blue-100" : "text-gray-400"}`}>
                                            {rol.label}
                                        </span>

                                        {isAdminBlocked && (
                                            <span className='text-[10px] text-red-400 font-medium absolute bottom-2 leading-tight text-center px-1'>
                                                Taken
                                            </span>
                                        )}
                                    </motion.div>
                                );
                            })}
                        </div>

                        {/* Submit Button */}
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
                                    Continue <span className='text-xl'>→</span>
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