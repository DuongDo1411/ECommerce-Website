"use client";

import React, { useState } from "react";
import { MdArrowBack, MdDashboard, MdMessage } from "react-icons/md";
import { FaBoxOpen, FaShoppingCart, FaStore, FaUndoAlt } from "react-icons/fa";
import { FaTicketAlt } from "react-icons/fa";
import { AiOutlineClose, AiOutlineMenu } from "react-icons/ai";
import { AnimatePresence, motion } from "motion/react";
import { useSelector } from "react-redux";
import Dashboard from "./Dashboard";
import VendorMessages from "./VendorMessages";
import VendorOrders from "./VendorOrders";
import VendorProducts from "./VendorProducts";
import VendorReturns from "./VendorReturns";
import VendorShopView from "./VendorShopView";
import VendorVouchers from "./VendorVouchers";
import { IUser } from "@/model/user.model";
import type { RootState } from "@/redux/store";

const menu = [
  { id: "dashboard", label: "Dashboard", icon: <MdDashboard size={22} /> },
  { id: "products", label: "Products", icon: <FaBoxOpen size={22} /> },
  { id: "orders", label: "Orders", icon: <FaShoppingCart size={22} /> },
  { id: "returns", label: "Hoàn trả", icon: <FaUndoAlt size={22} /> },
  { id: "vouchers", label: "Khuyến mãi", icon: <FaTicketAlt size={22} /> },
  { id: "messages", label: "Messages", icon: <MdMessage size={22} /> },
];

function MessageBadge({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <span className="ml-auto min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white shadow-lg shadow-red-500/30">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function ShopToggleButton({
  isViewingShop,
  onClick,
}: {
  isViewingShop: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.2 }}
      whileHover={{ x: 4 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all font-medium text-sm group ${
        isViewingShop
          ? "bg-linear-to-r from-emerald-600 to-teal-500 text-white shadow-lg shadow-teal-500/30"
          : "bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-transparent hover:border-teal-500/30"
      }`}
    >
      <span
        className={`transition-all ${
          isViewingShop ? "text-white" : "text-gray-400 group-hover:text-teal-400"
        }`}
      >
        {isViewingShop ? <MdArrowBack size={22} /> : <FaStore size={22} />}
      </span>
      {isViewingShop ? "← Về quản lý" : "Xem cửa hàng"}
    </motion.button>
  );
}

function VendorDashBoard({ user }: { user: IUser }) {
  const [activePage, setActivePage] = useState("dashboard");
  const [openMenu, setOpenMenu] = useState(false);
  const totalUnread = useSelector((state: RootState) => state.chat.totalUnread);
  const isViewingShop = activePage === "myshop";

  const renderPage = () => {
    switch (activePage) {
      case "dashboard":
        return <Dashboard onNavigate={setActivePage} />;
      case "products":
        return <VendorProducts />;
      case "orders":
        return <VendorOrders />;
      case "returns":
        return <VendorReturns />;
      case "vouchers":
        return <VendorVouchers />;
      case "messages":
        return <VendorMessages />;
      case "myshop":
        return <VendorShopView user={user} />;
      default:
        return <Dashboard onNavigate={setActivePage} />;
    }
  };

  const handleShopToggle = () => {
    setActivePage(isViewingShop ? "dashboard" : "myshop");
  };

  const renderMenuButton = (item: (typeof menu)[number], index: number, mobile = false) => (
    <motion.button
      key={item.id}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ x: 4 }}
      whileTap={mobile ? { scale: 0.95 } : undefined}
      onClick={() => {
        if (mobile) setOpenMenu(false);
        setActivePage(item.id);
      }}
      className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all font-medium text-sm group ${
        activePage === item.id
          ? "bg-linear-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/30"
          : "bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-transparent hover:border-emerald-500/30"
      }`}
    >
      <span
        className={`transition-all ${
          activePage === item.id
            ? "text-white"
            : "text-gray-400 group-hover:text-emerald-400"
        }`}
      >
        {item.icon}
      </span>
      <span>{item.label}</span>
      {item.id === "messages" && <MessageBadge count={totalUnread} />}
    </motion.button>
  );

  return (
    <div className="w-full flex min-h-screen bg-linear-to-br from-black via-gray-950 to-black text-white">
      <div className="lg:hidden fixed top-0 left-0 w-full bg-linear-to-r from-black via-gray-900 to-black px-6 py-4 flex justify-between items-center border-b border-emerald-500/20 z-50 shadow-lg shadow-emerald-500/10">
        <motion.h1
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-2xl font-bold bg-linear-to-r from-emerald-400 to-emerald-600 bg-clip-text text-transparent"
        >
          {isViewingShop ? "My Shop" : "Vendor Panel"}
        </motion.h1>
        {!openMenu && (
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setOpenMenu(true)}
            className="text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <span className="relative block">
              <AiOutlineMenu size={28} />
              {totalUnread > 0 && (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-black" />
              )}
            </span>
          </motion.button>
        )}
      </div>

      <motion.div
        initial={{ x: -40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="hidden lg:flex flex-col w-72 bg-linear-to-b from-gray-900/80 to-black/60 border-r border-emerald-500/20 mt-0 p-6 backdrop-blur-xl sticky top-0 h-screen"
      >
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <h1 className="text-2xl font-bold bg-linear-to-r from-emerald-400 to-emerald-600 bg-clip-text text-transparent">
            Vendor Panel
          </h1>
          <div className="h-1 w-12 bg-linear-to-r from-emerald-500 to-emerald-600 rounded-full mt-2" />
        </motion.div>

        <div className="flex flex-col gap-2">
          {menu.map((item, index) => renderMenuButton(item, index))}
        </div>

        <div className="mt-4 pt-4 border-t border-white/10">
          <ShopToggleButton isViewingShop={isViewingShop} onClick={handleShopToggle} />
        </div>
      </motion.div>

      <AnimatePresence>
        {openMenu && (
          <motion.div
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ duration: 0.3, type: "spring", stiffness: 200, damping: 24 }}
            className="lg:hidden fixed top-0 left-0 w-72 max-w-[80vw] h-screen bg-linear-to-b from-gray-900/95 to-black/95 backdrop-blur-xl p-6 z-40 border-r border-emerald-500/20 shadow-2xl flex flex-col"
          >
            <div className="flex justify-between items-center mb-8">
              <motion.h1
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-2xl font-bold bg-linear-to-r from-emerald-400 to-emerald-600 bg-clip-text text-transparent"
              >
                Vendor Panel
              </motion.h1>
              <motion.button
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setOpenMenu(false)}
                className="text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                <AiOutlineClose size={28} />
              </motion.button>
            </div>

            <div className="flex flex-col gap-2">
              {menu.map((item, index) => renderMenuButton(item, index, true))}
            </div>

            <div className="mt-4 pt-4 border-t border-white/10">
              <ShopToggleButton
                isViewingShop={isViewingShop}
                onClick={() => {
                  setOpenMenu(false);
                  handleShopToggle();
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {openMenu && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpenMenu(false)}
            className="lg:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-30"
          />
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4 }}
        className="flex-1 p-4 sm:p-6 lg:p-10 mt-20 lg:mt-0 bg-linear-to-br from-gray-950/50 via-transparent to-gray-950/50"
      >
        <motion.div
          key={activePage}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {renderPage()}
        </motion.div>
      </motion.div>
    </div>
  );
}

export default VendorDashBoard;
