"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type WalletVoucherRow = {
  status?: WalletStatus;
  voucher?: {
    _id?: string | { toString?: () => string } | null;
  } | null;
};

export type WalletStatus = "collected" | "reserved" | "used" | "expired";

export function voucherWalletActionLabel(
  status?: WalletStatus,
  isCollecting = false,
) {
  if (isCollecting) return "Đang lưu...";
  if (status === "collected") return "Đã lưu";
  if (status === "reserved") return "Đang giữ bởi đơn";
  if (status === "used") return "Đã dùng";
  if (status === "expired") return "Hết hạn";
  return "Lưu";
}

function isString(value: string | undefined): value is string {
  return typeof value === "string";
}

export function useCollectVoucher() {
  const router = useRouter();
  const [collectingId, setCollectingId] = useState("");
  const [collectedIds, setCollectedIds] = useState<Set<string>>(new Set());
  const [walletStatusById, setWalletStatusById] = useState<Map<string, WalletStatus>>(
    new Map(),
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/user/vouchers")
      .then((res) => {
        if (res.status === 401) return null;
        return res.json();
      })
      .then((data: { vouchers?: WalletVoucherRow[] } | null) => {
        if (!data?.vouchers) return;
        const statusById = new Map<string, WalletStatus>();
        for (const row of data.vouchers) {
          const id = row.voucher?._id?.toString?.();
          if (isString(id) && row.status) statusById.set(id, row.status);
        }
        setWalletStatusById(statusById);
        setCollectedIds(
          new Set(
            [...statusById.entries()]
              .filter(([, status]) => status === "collected")
              .map(([id]) => id),
          ),
        );
      })
      .catch(() => {});
  }, []);

  const collectVoucher = useCallback(
    async (voucherId: string) => {
      const walletStatus = walletStatusById.get(voucherId);
      if (collectingId || walletStatus === "collected") return;
      if (walletStatus) {
        setMessage(`Voucher ${voucherWalletActionLabel(walletStatus).toLowerCase()}`);
        return;
      }
      setCollectingId(voucherId);
      setMessage("");
      try {
        const res = await fetch("/api/user/vouchers/collect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voucherId }),
        });
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        const data = await res.json();
        if (!res.ok) {
          setMessage(data.message ?? "Không thể lưu voucher");
          return;
        }
        setWalletStatusById((prev) => new Map(prev).set(voucherId, "collected"));
        setCollectedIds((prev) => new Set(prev).add(voucherId));
        setMessage("Đã lưu voucher vào ví");
      } finally {
        setCollectingId("");
      }
    },
    [collectingId, router, walletStatusById],
  );

  return {
    collectVoucher,
    collectingId,
    collectedIds,
    walletStatusById,
    message,
    setMessage,
  };
}
