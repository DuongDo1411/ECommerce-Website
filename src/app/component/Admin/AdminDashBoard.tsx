"use client";
import React, { useState } from "react";
import { MdDashboard } from "react-icons/md";
import {
  FaUsers,
  FaShoppingBag,
  FaStore,
  FaCheckCircle,
  FaBox,
} from "react-icons/fa";
import { AiOutlineMenu, AiOutlineClose } from "react-icons/ai";
import { AnimatePresence, motion } from "motion/react";
import Dashboard from "./Dashboard";
import VendorDetails from "./VendorDetails";
import UserOrders from "./UserOrders";
import VendorApproval from "./VendorApproval";
import ProductApproval from "./ProductApproval";

function AdminDashBoard() {
  const [activePage, setActivePage] = useState("dashboard");
  const [openMenu, setOpenMenu] = useState(false);

  const renderPage = () => {
    switch (activePage) {
      case "dashboard":
        return <Dashboard />;
      case "vendors":
        return <VendorDetails />;
      case "orders":
        return <UserOrders />;
      case "vendor-approval":
        return <VendorApproval />;
      case "product-approval":
        return <ProductApproval />;
    }
  };

  const menu = [
    { id: "dashboard", label: "Dashboard", icon: <MdDashboard size={22} /> },
    { id: "vendors", label: "Vendor Details", icon: <FaStore size={22} /> },
    { id: "orders", label: "User Orders", icon: <FaShoppingBag size={22} /> },
    {
      id: "vendor-approval",
      label: "Vendor Approval",
      icon: <FaCheckCircle size={22} />,
    },
    {
      id: "product-approval",
      label: "Product Requests",
      icon: <FaBox size={22} />,
    },
  ];

  return (
    <div className="w-full flex min-h-screen bg-linear-to-br from-black via-gray-950 to-black text-white">
      {/* Mobile Tap bar */}
      <div className="lg:hidden fixed top-0 left-0 w-full bg-linear-to-r from-black via-gray-900 to-black px-6 py-4 flex justify-between items-center border-b border-blue-500/20 z-50 shadow-lg shadow-blue-500/10">
        <motion.h1
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-2xl font-bold bg-linear-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent"
        >
          Admin Panel
        </motion.h1>
        {!openMenu && (
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setOpenMenu(true)}
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            <AiOutlineMenu size={28} />
          </motion.button>
        )}
      </div>

      {/* Sidebar for large screens */}
      <motion.div
        initial={{ x: -40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="hidden lg:block w-72 bg-linear-to-b from-gray-900/80 to-black/60 border-r border-blue-500/20 mt-0 p-6 backdrop-blur-xl sticky top-0 h-screen"
      >
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <h1 className="text-2xl font-bold bg-linear-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
            Admin Panel
          </h1>
          <div className="h-1 w-12 bg-linear-to-r from-blue-500 to-blue-600 rounded-full mt-2" />
        </motion.div>

        <div className="flex flex-col gap-2">
          {menu.map((item, index) => (
            <motion.button
              key={item.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ x: 4 }}
              onClick={() => setActivePage(item.id)}
              className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all font-medium text-sm group
                ${
                  activePage === item.id
                    ? "bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/30"
                    : "bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-transparent hover:border-blue-500/30"
                }`}
            >
              <span
                className={`transition-all ${activePage === item.id ? "text-white" : "text-gray-400 group-hover:text-blue-400"}`}
              >
                {item.icon}
              </span>
              {item.label}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Sidebar for mobile */}
      <AnimatePresence>
        {openMenu && (
          <motion.div
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{
              duration: 0.3,
              type: "spring",
              stiffness: 200,
              damping: 24,
            }}
            className="lg:hidden fixed top-0 left-0 w-72 h-screen bg-linear-to-b from-gray-900/95 to-black/95 backdrop-blur-xl p-6 z-40 border-r border-blue-500/20 shadow-2xl"
          >
            <div className="flex justify-between items-center mb-8">
              <motion.h1
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-2xl font-bold bg-linear-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent"
              >
                Admin Panel
              </motion.h1>
              <motion.button
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setOpenMenu(false)}
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                <AiOutlineClose size={28} />
              </motion.button>
            </div>

            <div className="flex flex-col gap-2">
              {menu.map((item, index) => (
                <motion.button
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setOpenMenu(false);
                    setActivePage(item.id);
                  }}
                  className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all font-medium text-sm group
                  ${
                    activePage === item.id
                      ? "bg-linear-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/30"
                      : "bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-transparent hover:border-blue-500/30"
                  }`}
                >
                  <span
                    className={`transition-all ${activePage === item.id ? "text-white" : "text-gray-400 group-hover:text-blue-400"}`}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlay for mobile when menu is open */}
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

      {/* Main Area */}
      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4 }}
        className="flex-1 p-6 md:p-10 mt-20 lg:mt-0 bg-linear-to-br from-gray-950/50 via-transparent to-gray-950/50"
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

export default AdminDashBoard;
