'use client'
import React, { useEffect, useState } from 'react'
import Slider1 from '@/assets/Sliders/Slider1.jpg'
import Slider2 from '@/assets/Sliders/Slider2.jpg'
import Slider3 from '@/assets/Sliders/Slider3.jpg'
import Slider4 from '@/assets/Sliders/Slider4.jpg'
import Slider5 from '@/assets/Sliders/Slider5.jpg'
import { AnimatePresence, motion } from 'motion/react'
import Image from 'next/image'

function Slider() {
    const [current , setCurrent] = useState(0);
    const slides = [
        {
            image: Slider1,
            title: "RUN ON AIR",
            subtitle: "DO IT NOW.",
            description: "Running Shoes",
            button: "DISCOVER"
            
        },
        {
            image: Slider2,
            title: "STEP INTO POWER",
            subtitle: "FEEL THE SPEED",
            description: "Smart Gadgets for Smart People",
            button: "DISCOVER"
            
        },
        {
            image: Slider3,
            title: "STYLE & COMFORT",
            subtitle: "STEP INTO NEW ERA.",
            description: "Tommy Shelby 's factions",
            button: "DISCOVER"
            
        },
    ];

    useEffect(()=>{
        const interval = setInterval(()=>{
            setCurrent((prev)=>(prev + 1) % slides.length)

        },5000)
        return () => clearInterval(interval);

    },[])
    
  return (
    <div className="relative w-full min-h-[90vh] mt-0 
    overflow-hidden bg-black text-white md:mt-[60px] pt-0 top-0">
        <AnimatePresence>
            <motion.div
            key={current}
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.8 }}
            className='absolute inset-0 flex justify-center 
            items-center'
            >
                <Image src={slides[current].image} 
                alt={slides[current].title}
                className='object-cover opacity-60 hover:opacity-70 transition-opacity duration-500'
                fill/>

                <div className='absolute inset-0 flex flex-col
                items-start justify-center px-6 md:px-20 lg:px-32
                bg-linear-to-r from-black/80 via-black/50 to-transparent'>
                    <motion.h3 
                    className='text-xs md:text-sm uppercase
                    tracking-[3px] text-blue-400 font-semibold mb-2'
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    >
                        {slides[current].subtitle}

                    </motion.h3>

                    <motion.h1 
                    className='text-3xl md:text-5xl lg:text-7xl font-black mb-3 leading-tight tracking-tight'
                    initial={{ y: 40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    >
                        {slides[current].description}

                    </motion.h1>

                    <motion.p 
                    className='text-sm md:text-base text-gray-300 mb-8 font-light tracking-wide'
                    initial={{ y: 40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    >
                        {slides[current].title}

                    </motion.p>

                    <motion.button
                    className='px-8 py-3 bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white
                    font-semibold rounded-lg shadow-lg shadow-blue-500/50 transition-all duration-300 tracking-widest text-sm'
                    whileHover={{scale:1.08, boxShadow: '0 0 20px rgba(59, 130, 246, 0.8)'}}
                    whileTap={{scale:0.95}}
                    >
                        {slides[current].button}

                    </motion.button>
                    


                </div>

                
            </motion.div>
        </AnimatePresence>
        
        {/* Navigation Dots */}
        <div className='absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-3'>
            {
                slides.map((slide , index)=>(
                    <motion.button
                        key={index}
                        whileHover={{scale:1.2}}
                        onClick={()=>setCurrent(index)}
                        className={`h-3 rounded-full transition-all duration-500 ${
                            index === current
                            ? "w-12 bg-blue-500 shadow-lg shadow-blue-500/50"
                            : "w-3 bg-gray-500 hover:bg-gray-400"
                        }`}
                        aria-label={`Go to slide ${index + 1}`}
                    />
                ))
                    
                
            }
        </div>

        {/* Thumbnail Navigation */}
        <div className='absolute bottom-20 right-6 md:right-8 flex gap-3'>
            {
                slides.map((slide , index)=>(
                    <motion.div
                        key={index}
                        whileHover={{scale:1.15, y: -5}}
                        onClick={()=>setCurrent(index)}
                        className={`relative w-16 h-10 md:w-20 md:h-12 cursor-pointer rounded-lg overflow-hidden border-2 transition-all duration-300 ${
                            index === current
                            ? "border-blue-500 shadow-[0_0_15px_rgba(59,130,246,1)] scale-110"
                            : "border-gray-600 hover:border-blue-400 opacity-70 hover:opacity-100"
                        }`}
                    >
                        <Image src={slide.image} alt={slide.title} fill
                        className='object-cover'/>
                    </motion.div>

                ))
                    
                
            }
        </div>

    </div>
  )
}

export default Slider