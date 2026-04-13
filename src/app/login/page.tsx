'use client'
import {motion, AnimatePresence } from 'motion/react'
import { useRouter } from 'next/navigation';
import React, { useState } from 'react'
import { ClipLoader } from 'react-spinners'
import { FaEye } from "react-icons/fa";
import { FaEyeSlash } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { signIn } from 'next-auth/react';
function SignIn() {
  const [email , setEmail] = useState('')
  const [password , setPassword] = useState('')
  const [showPassword , setShowPassword] = useState(false)
  const router = useRouter();
  const [loading , setLoading] = useState(false);

  const handelSignIn = async (e:React.FormEvent)=>{
    setLoading(true);
    e.preventDefault();
    try {
      const result = await signIn("credentials" , {
        email,
        password,
        redirect:false
      })
      alert("Đăng nhập thành công");
      router.push("/");
      setLoading(false);
      
    } catch (error) {
      console.log(error);
      setLoading(false);
      alert(error);
    }
  }
  return (
    <div className='min-h-screen flex items-center justify-center bg-linear-to-br from-gray-900 via-black to-gray-900 text-white p-6'>
      <AnimatePresence>
         <motion.div 
            initial = {{opacity:0 , y:40}}
            animate = {{opacity:1 , y:0}}
            exit = {{opacity:0 , y:-40}}
            transition = {{duration:0.5}}
            className='w-full max-w-md bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 border border-white/20'>
                <h1 className='text-2xl font-bold mb-6 text-center text-white-400'>Welcome Back To 
                  <span className='text-blue-400'>{" "}MultiCart</span>
                </h1>

                <form onSubmit={handelSignIn}  className='flex flex-col gap-4'>
                    
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
                        className='absolute right-12 top-45 -translate-y-1/2 text-gray-400 hover:text-white transition'>
                            {showPassword ? <FaEyeSlash size={20} /> : <FaEye size={20} />}
                    </button>
                    <motion.button
                    disabled={loading}
                    type='submit'
                    whileHover={{scale: 1.03}}
                    whileTap={{scale: 0.95}}
                    className='mt-4 px-8 py-3 flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 rounded-xl font-medium w-full'
                    
                    > {loading ? <ClipLoader color='white' size={20} /> : "Đăng nhập"} 
                    
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
                    
                    > <FcGoogle /> <span className='font-medium'>Login with Google</span> 
                    </motion.button> 

                    <p className='text-center text-sm mt-4 text-gray-400'>
                        Don't have an account?{" "} 
                        <span 
                        onClick={()=>router.push("/register")} 
                        className='text-blue-400 hover:underline cursor-pointer'>Register</span>
                    </p>
                        
                    
                </form>
            </motion.div>
      </AnimatePresence>
      
         
      
    </div>
  )
}

export default SignIn