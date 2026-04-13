'use client'
import { motion, AnimatePresence } from 'motion/react'
import { useRouter } from 'next/navigation';
import React, { useState } from 'react'
import { ClipLoader } from 'react-spinners'
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { signIn } from 'next-auth/react';

function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handelSignIn = async (e: React.FormEvent) => {
    setLoading(true);
    e.preventDefault();
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false
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
            <h1 className='text-3xl font-bold text-gray-100 tracking-tight'>
              Welcome Back To <br/>
              <span className='text-transparent bg-clip-text bg-linear-to-r from-blue-400 to-cyan-400'>
                MultiCart
              </span>
            </h1>
            <p className='text-gray-400 text-sm mt-2'>Vui lòng đăng nhập để tiếp tục</p>
          </div>

          <form onSubmit={handelSignIn} className='flex flex-col gap-5'>
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

            {/* Divider */}
            <div className='flex items-center my-2'>
              <div className='flex-1 h-px bg-linear-to-r from-transparent via-gray-600 to-gray-600'></div>
              <span className='px-4 text-sm text-gray-400 font-medium'>or</span>
              <div className='flex-1 h-px bg-linear-to-l from-transparent via-gray-600 to-gray-600'></div>
            </div>

            {/* Google Button */}
            <motion.button
              type="button"
              onClick={() => signIn("google", { callbackUrl: "/" })}
              whileHover={{ scale: 1.02, backgroundColor: "rgba(255,255,255,0.15)" }}
              whileTap={{ scale: 0.98 }}
              className='flex items-center justify-center gap-3 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all duration-300'
            >
              <FcGoogle size={22} />
              <span className='font-medium text-gray-200'>Login with Google</span>
            </motion.button>

            {/* Register Link */}
            <p className='text-center text-sm mt-2 text-gray-400'>
              Don't have an account?{" "}
              <span
                onClick={() => router.push("/register")}
                className='text-blue-400 font-medium hover:text-blue-300 hover:underline cursor-pointer transition-colors'
              >
                Register
              </span>
            </p>

          </form>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

export default SignIn