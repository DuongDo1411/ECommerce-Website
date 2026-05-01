import { IUser } from "@/model/user.model";
import { AppDispatch, RootState } from "@/redux/store";
import { AnimatePresence, motion } from "motion/react";
import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  FaStore,
  FaPhone,
  FaEnvelope,
  FaMapLocationDot,
  FaFileInvoice,
} from "react-icons/fa6";
import { IoCheckmarkCircle, IoCloseCircle } from "react-icons/io5";
import axios from "axios";
import UseGetAllVendors from "@/hooks/UserGetAllVendors";
import { setAllVendorData } from "@/redux/vendorSlice";
import { ClipLoader } from "react-spinners";

function VendorApproval() {
  const dispatch = useDispatch<AppDispatch>();
  UseGetAllVendors();
  const allVendorsData: IUser[] = useSelector(
    (state: RootState) => state.vendor.allVendorsData,
  );
  const pendingVendors = Array.isArray(allVendorsData)
    ? allVendorsData.filter((v) => v.verificationStatus == "pending")
    : [];

  const [selectedVendor, setSelectedVendor] = useState<IUser | null>(null);

  const [loading, setLoading] = useState(false);

  const [rejectModel, setRejectModel] = useState(false);

  const [rejectedReason, setRejectedReason] = useState("");

  const openRejectReasonArea = () => {
    setRejectModel(true);
    setRejectedReason("");
  };

  const handleApproved = async () => {
    if (!selectedVendor) return;
    setLoading(true);
    try {
      await axios.post("/api/admin/update_vendor_status", {
        vendorId: selectedVendor?._id,
        status: "approved",
      });
      const updated = allVendorsData.filter(
        (v) => v._id !== selectedVendor?._id,
      );
      dispatch(setAllVendorData(updated));
      setSelectedVendor(null);
      setLoading(false);
      alert("Approval Success");
    } catch (error) {
      console.log(error);
      setLoading(false);
      alert("Approval Failed");
    }
  };

  const handleRejected = async () => {
    if (!selectedVendor) return;
    setLoading(true);
    try {
      await axios.post("/api/admin/update_vendor_status", {
        vendorId: selectedVendor?._id,
        status: "rejected",
        rejectedReason,
      });
      const updated = allVendorsData.filter(
        (v) => v._id !== selectedVendor?._id,
      );
      dispatch(setAllVendorData(updated));
      setSelectedVendor(null);
      setLoading(false);
      alert("Vendor Rejected");
    } catch (error) {
      console.log(error);
      setLoading(false);
      alert("Rejected Failed");
    }
  };
  return (
    <div className="w-full px-3 sm:px-6 lg:px-10 py-6 text-white">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="h-1 w-12 bg-linear-to-r from-blue-500 to-blue-600 rounded-full" />
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-linear-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
            Vendor Approval Requests
          </h1>
        </div>
        <p className="text-gray-400 text-sm ml-4">
          Manage and approve pending vendor registrations
        </p>
      </motion.div>

      {/* Desktop Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="hidden md:block overflow-x-auto bg-linear-to-br from-white/5 to-white/2 rounded-xl border border-blue-500/20 shadow-lg shadow-blue-500/10"
      >
        <table className="w-full text-left">
          <thead className="bg-linear-to-r from-blue-600/20 to-transparent border-b border-blue-500/20">
            <tr>
              <th className="p-4 font-semibold text-blue-400">Vendor Name</th>
              <th className="p-4 font-semibold text-blue-400">Shop Name</th>
              <th className="p-4 font-semibold text-blue-400">Phone</th>
              <th className="p-4 font-semibold text-blue-400">Status</th>
              <th className="p-4 text-center font-semibold text-blue-400">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {pendingVendors.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12">
                  <motion.div
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <p className="text-gray-500 text-lg">
                      ✨ No pending requests
                    </p>
                  </motion.div>
                </td>
              </tr>
            ) : (
              pendingVendors.map((vendor, index) => (
                <motion.tr
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05, duration: 0.4 }}
                  whileHover={{ backgroundColor: "rgba(59, 130, 246, 0.05)" }}
                  className="border-t border-blue-500/10 transition-all"
                >
                  <td className="p-4 font-medium">{vendor?.name}</td>
                  <td className="p-4 text-gray-300">
                    {vendor?.shopName || "N/A"}
                  </td>
                  <td className="p-4 text-gray-300">
                    {vendor?.phone || "N/A"}
                  </td>
                  <td className="p-4">
                    <motion.span
                      whileHover={{ scale: 1.05 }}
                      className="inline-block px-4 py-1.5 rounded-full text-xs font-semibold bg-linear-to-r from-blue-600/40 to-blue-500/40 text-blue-300 border border-blue-500/30"
                    >
                      ⏳ {vendor?.verificationStatus}
                    </motion.span>
                  </td>
                  <td className="p-4 text-center">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setSelectedVendor(vendor)}
                      className="px-5 py-2 rounded-lg bg-linear-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-sm font-semibold shadow-lg shadow-blue-500/30 transition-all"
                    >
                      View Details
                    </motion.button>
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </motion.div>

      {/* Mobile Responsive */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="md:hidden flex flex-col gap-4"
      >
        {pendingVendors.length === 0 ? (
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-center text-gray-500 mt-10 text-lg"
          >
            ✨ No pending requests
          </motion.div>
        ) : (
          pendingVendors.map((vendor, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.4 }}
              whileHover={{ y: -4 }}
              className="bg-linear-to-br from-white/8 to-white/4 border border-blue-500/20 rounded-xl p-5 space-y-3 shadow-lg shadow-black/20 hover:shadow-blue-500/10 transition-all"
            >
              <div className="flex justify-between items-start gap-3">
                <h3 className="font-bold text-lg text-white">{vendor?.name}</h3>
                <motion.span
                  whileHover={{ scale: 1.05 }}
                  className="px-3 py-1 rounded-full text-xs font-semibold bg-linear-to-r from-blue-600/40 to-blue-500/40 text-blue-300 border border-blue-500/30 whitespace-nowrap"
                >
                  ⏳ Pending
                </motion.span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-300">
                  <FaStore size={16} className="text-blue-400" />
                  <span>
                    <b>Shop:</b> {vendor?.shopName || "N/A"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <FaPhone size={16} className="text-blue-400" />
                  <span>
                    <b>Phone:</b> {vendor?.phone || "N/A"}
                  </span>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full mt-4 bg-linear-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-sm font-semibold py-2.5 rounded-lg shadow-lg shadow-blue-500/30 transition-all"
                onClick={() => setSelectedVendor(vendor)}
              >
                View Details
              </motion.button>
            </motion.div>
          ))
        )}
      </motion.div>

      {/* Modal */}
      <AnimatePresence>
        {selectedVendor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-8"
          >
            <motion.div
              initial={{ scale: 0.85, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 20 }}
              transition={{
                duration: 0.4,
                type: "spring",
                stiffness: 200,
                damping: 24,
              }}
              className="bg-linear-to-br from-gray-900 via-black to-gray-950 p-6 md:p-8 rounded-2xl w-full max-w-lg border border-blue-500/20 shadow-2xl shadow-black/50"
            >
              {/* Modal Header */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mb-6 pb-4 border-b border-blue-500/20"
              >
                <h3 className="text-2xl font-bold bg-linear-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                  Vendor Details
                </h3>
                <p className="text-gray-400 text-sm mt-1">
                  Review vendor information before approval
                </p>
              </motion.div>

              {/* Details Section */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="space-y-4 mb-8"
              >
                <DetailItem
                  icon={<FaStore />}
                  label="Name"
                  value={selectedVendor?.name}
                />
                <DetailItem
                  icon={<FaEnvelope />}
                  label="Email"
                  value={selectedVendor?.email}
                />
                <DetailItem
                  icon={<FaStore />}
                  label="Shop Name"
                  value={selectedVendor?.shopName}
                />
                <DetailItem
                  icon={<FaPhone />}
                  label="Phone"
                  value={selectedVendor?.phone}
                />
                <DetailItem
                  icon={<FaMapLocationDot />}
                  label="Shop Address"
                  value={selectedVendor?.shopAddress}
                />
                <DetailItem
                  icon={<FaFileInvoice />}
                  label="Tax Number"
                  value={selectedVendor?.taxNumber}
                />
              </motion.div>

              {/* Action Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-col sm:flex-row gap-3"
              >
                <motion.button
                  disabled={loading}
                  onClick={handleApproved}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex-1 bg-linear-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 py-2.5 rounded-lg text-sm font-bold shadow-lg shadow-green-500/30 transition-all flex items-center justify-center gap-2"
                >
                  <IoCheckmarkCircle size={18} />
                  {loading ? <ClipLoader size={20} color="white" /> : "Approve"}
                </motion.button>
                <motion.button
                  onClick={openRejectReasonArea}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex-1 bg-linear-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 py-2.5 rounded-lg text-sm font-bold shadow-lg shadow-red-500/30 transition-all flex items-center justify-center gap-2"
                >
                  <IoCloseCircle size={18} />
                  Reject
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedVendor(null)}
                  className="flex-1 bg-linear-to-r from-gray-700 to-gray-600 hover:from-gray-800 hover:to-gray-700 py-2.5 rounded-lg text-sm font-bold shadow-lg shadow-gray-500/20 transition-all"
                >
                  Cancel
                </motion.button>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {rejectModel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-8"
          >
            <motion.div
              initial={{ scale: 0.85, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 20 }}
              transition={{
                duration: 0.4,
                type: "spring",
                stiffness: 200,
                damping: 24,
              }}
              className="bg-linear-to-br from-gray-900 via-black to-gray-950 p-6 md:p-8 rounded-2xl w-full max-w-lg border border-blue-500/20 shadow-2xl shadow-black/50"
            >
              {/* Modal Header */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mb-6 pb-4 border-b border-blue-500/20"
              >
                <h3 className="text-2xl font-bold bg-linear-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                  Enter Rejection Reason
                </h3>
                <textarea
                  placeholder="Enter your rejection reason....."
                  className="w-full bg-white/10 border border-white/20 
                rounded-lg p-3 text-sm"
                  rows={3}
                  onChange={(e) => setRejectedReason(e.target.value)}
                  value={rejectedReason}
                />
              </motion.div>

              {/* Action Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-col sm:flex-row gap-3"
              >
                <motion.button
                  onClick={async () => {
                    await handleRejected();
                    setRejectModel(false);
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex-1 bg-linear-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 py-2.5 rounded-lg text-sm font-bold shadow-lg shadow-red-500/30 transition-all flex items-center justify-center gap-2"
                >
                  <IoCloseCircle size={18} />
                  {loading ? <ClipLoader size={20} color="white" /> : "Reject"}
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setRejectModel(false)}
                  className="flex-1 bg-linear-to-r from-gray-700 to-gray-600 hover:from-gray-800 hover:to-gray-700 py-2.5 rounded-lg text-sm font-bold shadow-lg shadow-gray-500/20 transition-all"
                >
                  Cancel
                </motion.button>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Helper component for detail items
const DetailItem = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
}) => (
  <motion.div
    whileHover={{ x: 4 }}
    className="flex items-start gap-3 p-3 rounded-lg bg-white/5 border border-blue-500/10 hover:border-blue-500/20 transition-all"
  >
    <span className="text-blue-400 mt-1 shrink-0">{icon}</span>
    <div className="flex-1">
      <p className="text-xs text-gray-500 font-semibold uppercase tracking-widest">
        {label}
      </p>
      <p className="text-gray-200 font-medium mt-1">{value || "N/A"}</p>
    </div>
  </motion.div>
);

export default VendorApproval;
