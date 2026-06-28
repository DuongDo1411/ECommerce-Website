"use client";

import {
  FaFloppyDisk,
  FaMapLocationDot,
  FaReceipt,
  FaStore,
} from "react-icons/fa6";
import { ClipLoader } from "react-spinners";

interface ShopSettingsTabProps {
  shopName: string;
  shopAddress: string;
  taxNumber: string;
  loading: boolean;
  onShopNameChange: (value: string) => void;
  onShopAddressChange: (value: string) => void;
  onTaxNumberChange: (value: string) => void;
  onSave: () => void;
}

export default function ShopSettingsTab({
  shopName,
  shopAddress,
  taxNumber,
  loading,
  onShopNameChange,
  onShopAddressChange,
  onTaxNumberChange,
  onSave,
}: ShopSettingsTabProps) {
  const inputCls =
    "w-full py-3.5 pl-11 pr-4 bg-white/5 border border-white/10 rounded-xl focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15 focus:outline-none transition-all text-white placeholder-gray-600";

  return (
    <section className="bg-linear-to-br from-white/[0.075] to-white/[0.035] border border-white/10 rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/25">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
          <FaStore className="text-emerald-300" size={18} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Thông tin cửa hàng</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Cập nhật thông tin nhận diện và xác minh cửa hàng.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <label className="text-[11px] text-gray-500 uppercase font-bold tracking-widest mb-2 block">
            Tên cửa hàng
          </label>
          <div className="relative group">
            <FaStore className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-emerald-400 transition-colors" size={15} />
            <input
              type="text"
              className={inputCls}
              placeholder="Nhập tên cửa hàng"
              onChange={(e) => onShopNameChange(e.target.value)}
              value={shopName}
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] text-gray-500 uppercase font-bold tracking-widest mb-2 block">
            Địa chỉ cửa hàng
          </label>
          <div className="relative group">
            <FaMapLocationDot className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-emerald-400 transition-colors" size={15} />
            <input
              type="text"
              className={inputCls}
              placeholder="Nhập địa chỉ cửa hàng"
              onChange={(e) => onShopAddressChange(e.target.value)}
              value={shopAddress}
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] text-gray-500 uppercase font-bold tracking-widest mb-2 block">
            Mã số thuế
          </label>
          <div className="relative group">
            <FaReceipt className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-emerald-400 transition-colors" size={15} />
            <input
              type="text"
              className={inputCls}
              placeholder="Nhập mã số thuế"
              onChange={(e) => onTaxNumberChange(e.target.value)}
              value={taxNumber}
            />
          </div>
        </div>

        <button
          onClick={onSave}
          disabled={loading}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 disabled:from-gray-600 disabled:to-gray-500 px-6 py-3.5 font-semibold shadow-lg shadow-emerald-500/10 transition-all"
        >
          {loading ? (
            <>
              <ClipLoader color="white" size={18} />
              Đang cập nhật...
            </>
          ) : (
            <>
              <FaFloppyDisk size={15} />
              Lưu thông tin cửa hàng
            </>
          )}
        </button>
      </div>
    </section>
  );
}
