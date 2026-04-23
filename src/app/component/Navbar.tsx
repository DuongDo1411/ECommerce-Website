"use client"
import React, { useState } from 'react'
import { IUser } from '@/model/user.model'
import { useRouter } from 'next/navigation'
import logo from '@/assets/logo.png'
import Image from 'next/image'
import { button, div } from 'motion/react-client'
import { AnimatePresence, motion } from 'motion/react'
import {
  AiOutlineSearch,
  AiOutlineUser,
  AiOutlineShoppingCart,
  AiOutlineMenu,
  AiOutlineClose,
  AiOutlineHome,
  AiOutlineAppstore,
  AiOutlinePhone,
  AiOutlineShop,
  AiOutlineLogin,
  AiOutlineLogout,
  AiOutlineSolution,
} from "react-icons/ai";
import { GoListOrdered, GoListUnordered } from 'react-icons/go'
import { signOut } from 'next-auth/react'

function Navbar({user}: {user: IUser}) {
    const router = useRouter();
    const [openMenu, setOpenMenu] = useState(false);
    const [sideBarOpen, setSideBarOpen] = useState(false);
  return (
    <div className='fixed top-0 left-0 w-full bg-linear-to-r from-black via-black to-gray-900 text-white z-50 shadow-lg border-b border-blue-500/20'>
        <div className='max-w-7xl mx-auto px-6 py-4 flex justify-between items-center'>
            {/* logo */}
            <motion.div 
            className='flex items-center gap-3 cursor-pointer' 
            onClick={() => router.push('/')}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            >
                <Image src={logo} alt="logo" width={40} height={40} className='rounded-full shadow-lg shadow-blue-500/50' />
                <span className='text-xl font-bold hidden sm:inline bg-linear-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent'>MultiCart</span>
            </motion.div>
            
            {user.role == 'user' && <div className='hidden md:flex gap-8'>
                    <NavItem label="Home" path="/" router={router} />
                    <NavItem label="Categories" path="/category" router={router} />
                    <NavItem label="Shop" path="/shop" router={router} />
                    <NavItem label="Orders" path="/orders" router={router} />
            </div>}
            
            {/* desktop icons */}
            <div className='hidden md:flex items-center gap-6'>
                {user?.role == 'user' && <IconBtn Icon={AiOutlineSearch} onclick={()=>router.push("/category")}/>}
                <IconBtn Icon={AiOutlinePhone} onclick={()=>router.push("/support")}/>
                
                <div className='relative'>
                    {user?.image ? (
                        <motion.div
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        >
                            <Image src={user?.image} alt='user'
                            width={40} height={40} className='w-10 h-10 rounded-full
                            object-cover border-2 border-blue-500/50 hover:border-blue-400
                            cursor-pointer shadow-lg shadow-blue-500/30 transition-all' 
                            onClick={()=>setOpenMenu(!openMenu)}
                            /> 
                        </motion.div>
                    ) : (
                        <IconBtn Icon={AiOutlineUser} onClick={()=> setOpenMenu(!openMenu)} />
                    )}
                    
                    <AnimatePresence>
                        {openMenu && (
                            <motion.div 
                            initial={{ opacity: 0, y: -15, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -15, scale: 0.95 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                            className='absolute right-0 mt-3 w-48 backdrop-blur-xl rounded-xl shadow-xl
                            border border-blue-500/30 bg-linear-to-br from-gray-900/80 to-black/80
                            overflow-hidden'
                            >
                                <DropDownBtn Icon={AiOutlineUser} label="Profile" onClick={()=>{router.push('/profile');setOpenMenu(false)}} />
                                <DropDownBtn Icon={AiOutlineLogin} label="SignIn" onClick={()=>{router.push('/login');setOpenMenu(false)}} />
                                <DropDownBtn Icon={AiOutlineLogout} label="SignOut" onClick={()=>{signOut();setOpenMenu(false)}} />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
                
                {user?.role == "user" && <CartBtn router={router} count="5"/> }
            </div>

            {/* mobile icons */}
            <div className='md:hidden flex items-center gap-4'>
                {user?.role == "vendor" || user?.role == "admin" ? (
                    <>
                        <IconBtn Icon={AiOutlinePhone} onclick={()=>router.push("/support")}/>
                        <div className='relative'>
                            {user?.image ? (
                                <motion.div
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.95 }}
                                >
                                    <Image src={user?.image} alt='user'
                                    width={32} height={32} className='w-8 h-8 rounded-full
                                    object-cover border-2 border-blue-500/50
                                    cursor-pointer shadow-lg shadow-blue-500/30' 
                                    onClick={()=>setOpenMenu(!openMenu)}
                                    /> 
                                </motion.div>
                            ) : (
                                <IconBtn Icon={AiOutlineUser} onClick={()=> setOpenMenu(!openMenu)} />
                            )}
                            
                            <AnimatePresence>
                                {openMenu && (
                                    <motion.div 
                                    initial={{ opacity: 0, y: -15, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -15, scale: 0.95 }}
                                    transition={{ duration: 0.3, ease: "easeOut" }}
                                    className='absolute right-0 mt-3 w-48 backdrop-blur-xl rounded-xl shadow-xl
                                    border border-blue-500/30 bg-linear-to-br from-gray-900/80 to-black/80
                                    overflow-hidden'
                                    >
                                        <DropDownBtn Icon={AiOutlineUser} label="Profile" onClick={()=>{router.push('/profile');setOpenMenu(false)}} />
                                        <DropDownBtn Icon={AiOutlineLogin} label="SignIn" onClick={()=>{router.push('/login');setOpenMenu(false)}} />
                                        <DropDownBtn Icon={AiOutlineLogout} label="SignOut" onClick={()=>{signOut();setOpenMenu(false)}} />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </>
                ):(
                    <>
                        <IconBtn Icon={AiOutlineSearch} onClick={()=>router.push("/category")}/>
                        <IconBtn Icon={AiOutlinePhone} onclick={()=>router.push("/support")}/>
                        <CartBtn router={router} count="5"/>
                        <motion.div 
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        >
                            <AiOutlineMenu size={28} className='cursor-pointer hover:text-blue-400 transition-colors' onClick={()=> setSideBarOpen(true)}/>
                        </motion.div>
                        
                        <AnimatePresence>
                            {sideBarOpen && (
                                <motion.div
                                initial={{ x: "100%" }}
                                animate={{ x: 0 }}
                                exit={{ x: "100%" }}
                                transition={{ type: "spring", stiffness: 200, damping: 24 }}
                                className='fixed top-0 right-0 h-screen w-[65%] bg-linear-to-b from-black via-gray-900 to-black
                                backdrop-blur-lg p-6 text-white border-l border-blue-500/20 shadow-xl shadow-black'
                                >
                                    <div className='flex justify-between items-center mb-8'>
                                        <h1 className='text-2xl font-bold bg-linear-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent'>Menu</h1>
                                        <motion.button
                                        whileHover={{ scale: 1.1, rotate: 90 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={()=> setSideBarOpen(false)}
                                        >
                                            <AiOutlineClose size={28} className='hover:text-blue-400 transition-colors' />
                                        </motion.button>
                                    </div>
                                    <div className='flex flex-col gap-3 text-lg'>
                                        <SidebarBtn label="Home" path="/" router={router} Icon={AiOutlineHome} setSideBarOpen={setSideBarOpen}/>
                                        <SidebarBtn label="Categories" path="/category" router={router} Icon={AiOutlineAppstore} setSideBarOpen={setSideBarOpen}/>
                                        <SidebarBtn label="Shops" path="/shop" router={router} Icon={AiOutlineShop} setSideBarOpen={setSideBarOpen}/>
                                        <SidebarBtn label="Orders" path="/orders" router={router} Icon={GoListUnordered} setSideBarOpen={setSideBarOpen}/>
                                        <SidebarBtn label="Profile" path="/profile" router={router} Icon={AiOutlineUser} setSideBarOpen={setSideBarOpen}/>
                                        <SidebarBtn label="SignIn" path="/login" router={router} Icon={AiOutlineLogin} setSideBarOpen={setSideBarOpen}/>
                                        <SidebarBtnforSignOut label="SignOut" Icon={AiOutlineLogout} setSideBarOpen={setSideBarOpen}/>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </>
                )}
            </div>
        </div>
    </div>
  )
}

export default Navbar

// Components
const NavItem = ({label , path , router}:any) => (
    <motion.button 
    whileHover={{scale: 1.08, color: '#60a5fa'}}
    whileTap={{scale: 0.95}}
    onClick={() => router.push(path)} 
    className='relative font-medium transition-colors hover:text-blue-400'
    >
        {label}
        <motion.div 
        className='absolute bottom-0 left-0 h-0.5 bg-linear-to-r from-blue-500 to-blue-600'
        initial={{ width: 0 }}
        whileHover={{ width: '100%' }}
        transition={{ duration: 0.3 }}
        />
    </motion.button>
)

const IconBtn = ({Icon , onClick}: any)=>(
    <motion.button 
    whileHover={{scale: 1.15, color: '#60a5fa'}}
    whileTap={{scale: 0.9}}
    onClick={onClick}
    className='transition-colors hover:text-blue-400'
    >
        <Icon size={24}/>
    </motion.button>
)

const DropDownBtn = ({Icon , label , onClick}:any)=>(
    <motion.button 
    whileHover={{x: 5, backgroundColor: 'rgba(59, 130, 246, 0.1)'}}
    className='flex items-center gap-3 w-full px-4 py-3 hover:bg-blue-500/10 
    text-left transition-colors font-medium' 
    onClick={() => onClick()}
    >
        <Icon size={20} className='text-blue-400'/>{label}
    </motion.button>
)

const CartBtn = ({router , count}: any) =>(
    <motion.button 
    whileHover={{scale: 1.15}} 
    whileTap={{scale: 0.9}}
    onClick={()=> router.push('/cart')} 
    className='relative hover:text-blue-400 transition-colors'
    >
        <AiOutlineShoppingCart size={24}/>
        {count > 0 && (
            <motion.span 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className='absolute -top-2 -right-2 bg-linear-to-r from-blue-500 to-blue-600 text-white text-xs 
            rounded-full px-1.5 font-bold shadow-lg shadow-blue-500/50'
            >
                {count}
            </motion.span>
        )}
    </motion.button>
)

const SidebarBtn = ({label , path , router , Icon , setSideBarOpen}:any)=>(
    <motion.button 
    whileHover={{x: 8, backgroundColor: 'rgba(59, 130, 246, 0.15)'}}
    whileTap={{scale: 0.95}}
    className='flex items-center gap-3 px-4 py-3 rounded-lg bg-white/5 border border-blue-500/20
    hover:border-blue-500/50 text-left font-medium transition-all'
    onClick={() => {
        router.push(path)
        setSideBarOpen(false)
    }}
    >
        <Icon size={20} className='text-blue-400'/>{label}
    </motion.button>
)

const SidebarBtnforSignOut = ({label , Icon , setSideBarOpen}:any)=>(
    <motion.button 
    whileHover={{x: 8, backgroundColor: 'rgba(239, 68, 68, 0.1)'}}
    whileTap={{scale: 0.95}}
    className='flex items-center gap-3 px-4 py-3 rounded-lg bg-white/5 border border-red-500/20
    hover:border-red-500/50 text-left font-medium transition-all hover:text-red-400'
    onClick={() => {
        signOut();
        setSideBarOpen(false)
    }}
    >
        <Icon size={20} className='text-red-400'/>{label}
    </motion.button>
)