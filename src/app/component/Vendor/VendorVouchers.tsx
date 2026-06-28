"use client";

import VoucherManager from "@/app/component/Voucher/VoucherManager";

export default function VendorVouchers() {
  return (
    <VoucherManager
      apiBase="/api/vendor/vouchers"
      accent="emerald"
      allowFreeship={false}
      mode="vendor"
      title="Khuyến mãi"
      subtitle="Tạo voucher shop cho sản phẩm của bạn."
    />
  );
}
