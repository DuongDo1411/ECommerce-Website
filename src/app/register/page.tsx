'use client'
import React, { useState } from 'react'
import {AnimatePresence, motion} from 'motion/react'
import { TbPlayerTrackNext } from "react-icons/tb";
import { FaEye } from "react-icons/fa";
import { FaEyeSlash } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { ClipLoader } from 'react-spinners';
import { signIn } from 'next-auth/react';
function Register() {
    const [step , setStep] = useState<1 | 2>(1)
    const [name , setName] = useState('')
    const [email , setEmail] = useState('')
    const [password , setPassword] = useState('')
    const [showPassword , setShowPassword] = useState(false)
    const router = useRouter();
    const [loading , setLoading] = useState(false);
    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const result = await axios.post("/api/auth/register", 
            {
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
    
    <div className='min-h-screen flex items-center justify-center 
    bg-linear-to-br from-gray-900 via-black to-gray-900 text-white p-6'>
        <AnimatePresence mode='wait'>
            {/*for step1 UI */}
            {step === 1 && 
            <motion.div 
            initial = {{opacity:0 , y:40}}
            animate = {{opacity:1 , y:0}}
            exit = {{opacity:0 , y:-40}}
            transition = {{duration:0.5}}
            className='w-full max-w-lg text-center bg-white/10 
            backdrop-blur-md rounded-2xl shadow-2xl p-10 border border-white/20'>
                <h1 className='text-4xl font-bold mb-4 text-blue-400'>Welcome to MultiCart</h1>
                <p className='text-gray-300 mb-6'>Đăng kí với 1 trong các loại tài khoản sau:</p>
                <div className='grid grid-cols-3 gap-4 mb-6'>
                    {
                        [
                            {label: "User", icon: "👤", color: "from-blue-500 to-cyan-500" , value: "User"},
                            {label: "Seller", icon: "🏪", color: "from-purple-500 to-pink-500" , value: "Vendor"},
                            {label: "Admin", icon: "🛡️", color: "from-red-500 to-yellow-500" , value: "Admin"},
                        ].map((item) => (
                            <motion.div 
                            key={item.value}
                            whileHover={{scale: 1.1}}
                            whileTap={{scale: 0.95}}
                            className={`bg-linear-to-br ${item.color} 
                            p-6 rounded-xl cursor-pointer shadow-lg hover:shadow-xl transition-all`}
                            >
                                <span className='text-4xl mb-2'>{item.icon}</span>
                                <span className='text-sm font-medium'>{item.value}</span>


                            </motion.div>

                            
                            
                        ))
                        
                    }
                    
                </div>
                <motion.button
                onClick={()=>setStep(2)}
                whileHover={{scale: 1.03}}
                whileTap={{scale: 0.95}}
                className='mt-4 px-8 py-3 flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 rounded-xl font-medium w-full'
                
                > Next <TbPlayerTrackNext size={20}/> </motion.button>

            
            </motion.div>}

            {/*for step2 UI */}
            {step === 2 && 
            <motion.div 
            initial = {{opacity:0 , y:40}}
            animate = {{opacity:1 , y:0}}
            exit = {{opacity:0 , y:-40}}
            transition = {{duration:0.5}}
            className='w-full max-w-md bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 border border-white/20'>
                <h1 className='text-2xl font-bold mb-6 text-center text-blue-400'>Đăng kí tài khoản</h1>
                <form onSubmit={handleSignUp} className='flex flex-col gap-4'>
                    <input 
                    type="text" 
                    required
                    className='bg-white/10 border border-white/30 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500'
                    placeholder='Tên của bạn'
                    onChange={(e)=>setName(e.target.value)} value={name}
                    />
                    <input 
                    type="email" 
                    required
                    className='bg-white/10 border border-white/30 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500'
                    placeholder='Email'
                    onChange={(e)=>setEmail(e.target.value)} value={email}
                    />
                    <input 
                        type={showPassword ? "text" : "password"} 
                        required
                        className='bg-white/10 relative border border-white/30 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500'
                        placeholder='Password'
                        onChange={(e)=>setPassword(e.target.value)} value={password}
                    />
                    <button
                        type='button'
                        onClick={()=>setShowPassword(!showPassword)} 
                        className='absolute right-12 top-61 -translate-y-1/2 text-gray-400 hover:text-white transition'>
                            {showPassword ? <FaEyeSlash size={20} /> : <FaEye size={20} />}
                    </button>
                    <motion.button
                    disabled={loading}
                    type='submit'
                    whileHover={{scale: 1.03}}
                    whileTap={{scale: 0.95}}
                    className='mt-4 px-8 py-3 flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 rounded-xl font-medium w-full'
                    
                    > {loading ? <ClipLoader color='white' size={20} /> : "Đăng ký"} 
                    
                    </motion.button>

                    <div className='flex item-center my-3'>
                        <div className='flex-1 h-px bg-gray-600'></div>
                        <span className='px-3 text-sm text-gray-400'>or</span>
                        <div className='flex-1 h-px bg-gray-600'></div>
                    </div>   

                    <motion.button
                    onClick={()=>signIn("google", {callbackUrl:"/"})}
                    whileHover={{scale: 1.03}}
                    whileTap={{scale: 0.95}}
                    className='flex items-center justify-center gap-3 py-3 bg-white/10 hover:bg-white/20 border border-white/30 rounded-xl transition'
                    
                    > <FcGoogle /> <span className='font-medium'>Continue with Google</span> 
                    </motion.button> 

                    <p className='text-center text-sm mt-4 text-gray-400'>
                        Already have an account{" "} 
                        <span 
                        onClick={()=>router.push("/login")} 
                        className='text-blue-400 hover:underline cursor-pointer'>Login</span>
                    </p>
                        
                    
                </form>
            </motion.div>}
        </AnimatePresence>

    </div>
  )
}

export default Register 