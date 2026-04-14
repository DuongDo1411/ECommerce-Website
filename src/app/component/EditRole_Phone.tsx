'use client'
import axios from 'axios';
import { AnimatePresence, motion } from 'motion/react'
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react'
import { AiOutlineShop, AiOutlineTool, AiOutlineUser } from 'react-icons/ai';
import { ClipLoader } from 'react-spinners';

function EditRole_Phone() {
    const[role , setRole] = useState<string>("");
    const[phone , setPhone] = useState<string>("");
    const roles = [
        { label: "Admin", value: "admin", icon: <AiOutlineTool size={40} /> },
        { label: "Vendor", value: "vendor", icon: <AiOutlineShop size={40} /> },
        { label: "User", value: "user", icon: <AiOutlineUser size={40} /> },
    ];
    const [adminExist , setAdminExist] = useState(false);
    const [loading , setLoading] = useState(false);
    const router = useRouter();
    useEffect(()=>{
        const checkAdminExist = async()=>{
            try {
                const res = await axios.get("/api/admin/check-admin");
                setAdminExist(res.data.exists);
            } catch (error) {
                setAdminExist(false);
                console.log(error);
            }
        }
        checkAdminExist();
    },[])

    const handelSubmit = async(e:React.FormEvent) => {
        e.preventDefault();
        if(!role || !phone){
            alert("please select the role and enter the phone number");
            return;
        }
        setLoading(true);
        try {
            const result = await axios.post("api/user/edit-role-phone",{role,phone});
            alert(result.data.message);
            setLoading(false);
            router.push("/");
        } catch (error) {
            setLoading(false);
            console.log(error);
        }
    }
    

    return (
        <div className='min-h-screen flex items-center justify-center bg-linear-to-br from-gray-900 via-black to-gray-900 text-white p-6'>
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -40 }}
                    transition={{ duration: 0.5}}
                    className='w-full max-w-md bg-white/3 backdrop-blur-xl rounded-3xl shadow-[0_0_40px_rgba(0,0,0,0.5)] p-8 sm:p-10 border border-white/10'>
                        <h1 className='text-4xl font-semibold text-center mb-4'>Choose Your Role</h1>
                        <p className='text-center text-gray-400 mb-8 text-base'>Select your role and enter your mobile number to continue</p>
                        <form onSubmit={handelSubmit} className='flex flex-col gap-8'>
                            <input 
                            type="text"
                            placeholder='Enter your phone number'
                            maxLength={10}
                            required
                            className='bg-white/10 border border-white/30 rounded-lg p-4 
                            text-lg focus:outline-none focus:ring-2 focus:ring-blue-500'
                            onChange={(e)=>setPhone(e.target.value)} value = {phone} 
                            />
                            <div className='grid grid-cols-1 sm:grid-cols-3 gap-5'>
                                {
                                    roles.map((rol)=>{
                                        const isAdminBlocked = rol.value == "admin" && adminExist;
                                        return (
                                            <motion.div
                                                key={rol.value}
                                                whileHover={!isAdminBlocked ? {scale: 1.07} : {}}
                                                
                                                onClick={()=>{
                                                    if(isAdminBlocked){
                                                        alert("🚫Admin already exists. You cannot select Admin role !!!");
                                                        return;
                                                    }
                                                    setRole(rol.value);
                                                }}
                                                className={`cursor-pointer p-6 text-center rounded-2xl border transition text-lg font-medium 
                                                ${
                                                    role === rol.value
                                                    ? "border-blue-500 bg-blue-500/40"
                                                    : "border-white/20 bg-white/10 hover:bg-white/20"
                                                } 
                                                ${isAdminBlocked && "opacity-40 cursor-not-allowed"}`
                                                }

                                            >
                                                <div className='flex justify-center mb-3'>{rol.icon}</div>
                                                <p>{rol.value}</p>
                                                {isAdminBlocked && <p className='text-sm text-red-500'>Admin already exists</p>}
                                                
                                            </motion.div>
                                        );
                                    })
                                }

                            </div>
                            <motion.button
                                disabled={loading}
                                type='submit'
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className='mt-2 w-full py-4 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all disabled:opacity-70 disabled:cursor-not-allowed'
                            >
                                {loading ? <ClipLoader color='white' size={24} /> : "Submit Now"}
                            </motion.button>
                        </form>
                    
                </motion.div>
            </AnimatePresence>
        </div>
    )
}

export default EditRole_Phone