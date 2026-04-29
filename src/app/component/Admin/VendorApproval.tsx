import { IUser } from "@/model/user.model";
import { RootState } from "@/redux/store";
import React from "react";
import { useSelector } from "react-redux";

function VendorApproval() {
  const allVendorsData: IUser[] = useSelector(
    (state: RootState) => state.vendor.allVendorsData,
  );
  const pendingVendors = Array.isArray(allVendorsData)
    ? allVendorsData.filter((v) => v.veritificationStatus == "pending")
    : [];
  return (
    <div className="w-full px-3 sm:px-6 lg:px-10 py-6 text-white">
      <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold mb-6 text-center sm:text-left">
        Vendor Approval Requests
      </h1>

      {/* desktop table */}
      <div className="hidden md:block overflow-x-auto bg-white/5 rounded-xl border border-white/10">
        <table className="w-full text-left">
          <thead className="bg-white/10">
            <tr>
              <th className="p-4">Vendor Name</th>
              <th className="p-4">Shop Name</th>
              <th className="p-4">Phone</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-center">Action</th>
            </tr>
          </thead>
        </table>
      </div>
    </div>
  );
}

export default VendorApproval;
