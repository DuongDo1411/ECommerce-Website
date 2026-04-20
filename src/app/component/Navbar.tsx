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
    <div className='fixed top-0 left-0 w-full bg-black text-white z-50 shadow-lg border-b border-white/10'>
        <div className='max-w-7xl mx-auto px-6 py-3 flex justify-between items-center'>
            {/* logo */}
            <div className='flex items-center gap-2 cursor-pointer' onClick={() => router.push('/')}>
                <Image src={logo} alt="logo" width={40} height={40} className='rounded-full' />
                <span className='text-xl font-semibold hidden sm:inline'>MultiCart</span>
                
                
            </div>
            {user.role == 'user' && <div className='hidden md:flex gap-8'>
                    <NavItem label="Home" path="/" router={router} />
                    <NavItem label="Categories" path="/category" router={router} />
                    <NavItem label="Shop" path="/shop" router={router} />
                    <NavItem label="Orders" path="/orders" router={router} />
                    
                    
                    
                    
                    </div>}
                    {/* deskstop icons */}
                    <div className='hidden md:flex items-center gap-6'>
                        {user?.role == 'user' && <IconBtn Icon={AiOutlineSearch} onclick={()=>router.push("/category")}/>}
                            <IconBtn Icon={AiOutlinePhone} onclick={()=>router.push("/support")}/>
                                <div className='relative'>
                                    {user?.image ? <Image src={user?.image} alt='user'
                                    width={40} height={40} className='w-10 h-10 rounded-full
                                    object-cover border border-gray-700
                                    cursor-pointer' onClick={()=>setOpenMenu(!openMenu)}/> 
                                    : <IconBtn Icon={AiOutlineUser} onClick={()=> setOpenMenu(!openMenu)} />}
                                    
                                    <AnimatePresence>
                                        {openMenu && <motion.div 
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ duration: 0.5, ease: "easeOut" }}
                                        className='absolute right-0
                                        mt-3 w-48 backdrop-blur-lg rounded-xl shadow-lg
                                        border bg-[#6a69693c]'>
                                        
                                        <DropDownBtn Icon={AiOutlineUser} label="Profile" onClick={()=>{router.push('/profile');setOpenMenu(false)}} />
                                        <DropDownBtn Icon={AiOutlineLogin} label="SignIn" onClick={()=>{router.push('/login');setOpenMenu(false)}} />
                                        <DropDownBtn Icon={AiOutlineLogout} label="SignOut" onClick={()=>{signOut();setOpenMenu(false)}} />

                                        </motion.div>}
                                    </AnimatePresence>
                                </div>
                                {user?.role == "user" && <CartBtn router={router} count="5"/> }
                    </div>

                    {/* mobile icons  */}
                    <div className='md:hidden flex items-center gap-4'>
                        {user?.role == "vendor" || user?.role == "admin" ? (
                            <>
                            <IconBtn Icon={AiOutlinePhone} onclick={()=>router.push("/support")}/>
                            <div className='relative'>
                                    {user?.image ? <Image src={user?.image} alt='user'
                                    width={32} height={32} className='w-8 h-8 rounded-full
                                    object-cover border border-gray-700
                                    cursor-pointer' onClick={()=>setOpenMenu(!openMenu)}/> 
                                    : <IconBtn Icon={AiOutlineUser} onClick={()=> setOpenMenu(!openMenu)} />}
                                    
                                    <AnimatePresence>
                                        {openMenu && <motion.div 
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ duration: 0.5, ease: "easeOut" }}
                                        className='absolute right-0
                                        mt-3 w-48 backdrop-blur-lg rounded-xl shadow-lg
                                        border bg-[#6a69693c]'>
                                        
                                        <DropDownBtn Icon={AiOutlineUser} label="Profile" onClick={()=>{router.push('/profile');setOpenMenu(false)}} />
                                        <DropDownBtn Icon={AiOutlineLogin} label="SignIn" onClick={()=>{router.push('/login');setOpenMenu(false)}} />
                                        <DropDownBtn Icon={AiOutlineLogout} label="SignOut" onClick={()=>{signOut();setOpenMenu(false)}} />

                                        </motion.div>}
                                    </AnimatePresence>
                                </div>
                            </>
                        ):(
                            <>
                            <IconBtn Icon={AiOutlineSearch} onClick={()=>router.push("/category")}/>
                            <IconBtn Icon={AiOutlinePhone} onclick={()=>router.push("/support")}/>
                            <CartBtn router={router} count="5"/>
                            <AiOutlineMenu size={28} className='cursor-pointer' onClick={()=> setSideBarOpen(true)}/>
                                <AnimatePresence>
                                    {sideBarOpen && <motion.div
                                    initial={{ x: "100%" }}
                                    animate={{ x: 0 }}
                                    exit={{ x: "100%" }}
                                    transition={{ type: "spring", stiffness: 200, damping: 24 }}
                                    className='fixed top-0 right-0 h-screen w-[65%] bg-black/90 
                                    backdrop-blur-lg p-6 text-white border-l'
                                    >
                                        <div className='flex justify-between items-center mb-6'>
                                            <h1 className='text-2xl font-semibold'>Menu</h1>
                                            <AiOutlineClose size={28} className='cursor-pointer' 
                                            onClick={()=> setSideBarOpen(false)} />
                                        </div>
                                        <div className='flex flex-col gap-4 text-lg'>
                                            <SidebarBtn label="Home" path="/" router={router} Icon={AiOutlineHome} setSideBarOpen={setSideBarOpen}/>
                                            <SidebarBtn label="Categories" path="/category" router={router} Icon={AiOutlineAppstore} setSideBarOpen={setSideBarOpen}/>
                                            <SidebarBtn label="Shops" path="/shop" router={router} Icon={AiOutlineShop} setSideBarOpen={setSideBarOpen}/>
                                            <SidebarBtn label="Orders" path="/orders" router={router} Icon={GoListUnordered} setSideBarOpen={setSideBarOpen}/>
                                            <SidebarBtn label="Profile" path="/profile" router={router} Icon={AiOutlineUser} setSideBarOpen={setSideBarOpen}/>
                                            <SidebarBtn label="SignIn" path="/login" router={router} Icon={AiOutlineLogin} setSideBarOpen={setSideBarOpen}/>
                                            <SidebarBtnforSignOut label="SignOut" Icon={AiOutlineLogout} setSideBarOpen={setSideBarOpen}/>
                                            

                                        </div>

                                   </motion.div>}
                                </AnimatePresence>
                            </>
                        )

                        }
                    </div>

        </div>

    </div>
  )
}

export default Navbar

//components
const NavItem = ({label , path , router}:any) => (
    <motion.button whileHover={{scale: 1.1}} onClick={() => router.push(path)} className='hover:text-gray-300'>{label}</motion.button>
)

const IconBtn = ({Icon , onClick}: any)=>(
    <motion.button whileHover={{scale: 1.1}} onClick={onClick}>
        <Icon size={24}/>
    </motion.button>
)

const DropDownBtn = ({Icon , label , onClick}:any)=>(
    <button className='flex items-center gap-3 w-full px-4 py-2 hover:bg-white/10 
    text-left' onClick={() => onClick()
        
    }>
        <Icon size={24}/>{label}

    </button>
)

const CartBtn = ({router , count}: any) =>(
    <motion.button whileHover={{scale:1.1}} onClick={()=> router.push('/cart')} className='relative'>
        <AiOutlineShoppingCart size={24}/>
        {count > 0 && <span className='absolute -top-2 -right-2 bg-blue-500 text-while text-xs 
        rounded-full px-1'>{count}</span>}
    </motion.button>
)

const SidebarBtn = ({label , path , router , Icon , setSideBarOpen}:any)=>(
    <button className='flex items-center gap-3 px-4 py-2 rounded-lg bg-[#6a69693c]
    hover:bg-white/10 text-left'
    onClick={() => {
        router.push(path)
        setSideBarOpen(false)
    }}
    >
        <Icon size={20}/>{label}
    </button>
)

const SidebarBtnforSignOut = ({label , Icon , setSideBarOpen}:any)=>(
    <button className='flex items-center gap-3 px-4 py-2 rounded-lg bg-[#6a69693c]
    hover:bg-white/10 text-left'
    onClick={() => {
        signOut();
        setSideBarOpen(false)
    }}
    >
        <Icon size={20}/>{label}
    </button>
)

    

    

