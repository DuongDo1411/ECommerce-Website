'use client'
import { AnimatePresence, motion } from 'motion/react';
import React, { useEffect, useState } from 'react'
import { FaAngleLeft } from "react-icons/fa6";
import { FaAngleRight } from "react-icons/fa6";



function CategorySlider() {
    const [startIndex , setStartIndex] = useState(0);
    const categories = [
        { label: "Fashion & Lifestyle", icon: "👗" },
        { label: "Electronics & Gadgets", icon: "📱" },
        { label: "Home & Living", icon: "🏠" },
        { label: "Beauty & Personal Care", icon: "💄" },
        { label: "Toys, Kids & Baby", icon: "🧸" },
        { label: "Food & Grocery", icon: "🛒" },
        { label: "Sports & Fitness", icon: "🏀" },
        { label: "Automative Accessories", icon: "🚗" },
        { label: "Gifts & Handcrafts", icon: "🎁" },
        { label: "Books & Stationery", icon: "📚" },
    ];

    const nextSlice = () =>{
        setStartIndex((prev)=> (prev + 5) % categories.length);
    }

    const prevSlice = () =>{
        setStartIndex((prev)=> prev - 5  < 0 ? categories.length - 5 : prev - 5);
    }
    useEffect(() => {
        const interval = setInterval(nextSlice,5000);
        return () => clearInterval(interval);

    },[])
  return (
    <motion.div 
    initial={{ opacity: 0, y: 60 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.8 }}
    viewport={{ once: true }}
    className='w-full mx-auto p-8 md:p-12 lg:p-16 text-center 
    bg-linear-to-br from-black via-gray-950 to-black relative'>
        <div className='mb-4'>
            <motion.div 
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className='h-1 w-16 bg-linear-to-r from-blue-500 to-blue-600 mx-auto mb-4'
            />
            <h2 className='text-3xl md:text-4xl lg:text-5xl font-bold mb-2 text-white tracking-tight'>
                Shop by Categories
            </h2>
            <p className='text-gray-400 text-sm md:text-base'>Explore our wide range of products</p>
        </div>

        <div className='relative overflow-visible py-8'>
            <AnimatePresence mode='wait'>
                <motion.div 
                    key={startIndex}
                    initial={{ opacity: 0, x: 120 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -120 }}
                    transition={{ duration: 0.6 }}
                    className='grid grid-cols-1 sm:grid-cols-2 
                    md:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-6 px-16 md:px-20'
                >
                    {
                        categories.slice(startIndex , startIndex + 5).map((item , index)=>(
                            <motion.div 
                            key={index}
                            whileHover={{scale:1.08, y: -8}}
                            whileTap={{scale:0.95}}
                            className='group bg-linear-to-br from-white/10 to-white/5 
                            border border-white/20 hover:border-blue-500/50 p-6 md:p-8
                            rounded-2xl cursor-pointer
                            text-white transition-all duration-300
                            shadow-lg hover:shadow-xl hover:shadow-blue-500/20
                            backdrop-blur-sm'
                            >
                                <span className='text-5xl md:text-6xl mb-4 block group-hover:scale-110 transition-transform duration-300'>{item.icon}</span>
                                <p className='text-sm md:text-base font-semibold group-hover:text-blue-400 transition-colors duration-300'>{item.label}</p>
                                
                            </motion.div>

                            
                        ))
                    }

                </motion.div>

            </AnimatePresence>
            
            {/* Left Navigation Button */}
            <motion.button 
            onClick={prevSlice}
            whileHover={{scale: 1.15, boxShadow: '0 0 15px rgba(59, 130, 246, 0.6)'}}
            whileTap={{scale: 0.9}}
            className='absolute left-0 top-1/2 -translate-y-1/2 z-20
            border-2 border-blue-500/50 hover:border-blue-400 bg-linear-to-r from-blue-600/40 to-blue-500/40 
            hover:from-blue-600/60 hover:to-blue-500/60 text-white p-3 md:p-4
            rounded-full transition-all duration-300 backdrop-blur-sm
            shadow-lg hover:shadow-blue-500/50'>
                <FaAngleLeft size={20} className='md:w-6 md:h-6'/>
            </motion.button>

            {/* Right Navigation Button */}
            <motion.button 
            onClick={nextSlice}
            whileHover={{scale: 1.15, boxShadow: '0 0 15px rgba(59, 130, 246, 0.6)'}}
            whileTap={{scale: 0.9}}
            className='absolute right-0 top-1/2 -translate-y-1/2 z-20
            border-2 border-blue-500/50 hover:border-blue-400 bg-linear-to-l from-blue-600/40 to-blue-500/40 
            hover:from-blue-600/60 hover:to-blue-500/60 text-white p-3 md:p-4
            rounded-full transition-all duration-300 backdrop-blur-sm
            shadow-lg hover:shadow-blue-500/50'>
                <FaAngleRight size={20} className='md:w-6 md:h-6'/>
            </motion.button>
        </div>

        
    </motion.div>
  )
}

export default CategorySlider