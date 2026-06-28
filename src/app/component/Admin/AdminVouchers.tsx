"use client";

import VoucherManager from "@/app/component/Voucher/VoucherManager";

export default function AdminVouchers() {
  return (
    <VoucherManager
      apiBase="/api/admin/vouchers"
      accent="blue"
      allowFreeship
      mode="admin"
      title="Voucher Sàn"
      subtitle="Tạo voucher platform hoặc freeship cho toàn sàn."
    />
  );
}
