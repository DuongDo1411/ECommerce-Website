"use client";
import axios from "axios";
import { useEffect, useState } from "react";
import { ClipLoader } from "react-spinners";
import type { Address } from "./AddressBook";

interface Props {
  open: boolean;
  selectedId?: string;
  onClose: () => void;
  onPick: (address: Address) => void;
}

// Picks one saved address. Reuses /api/user/addresses; does not edit.
export default function AddressPickerModal({
  open,
  selectedId,
  onClose,
  onPick,
}: Props) {
  if (!open) return null;

  return (
    <AddressPickerPanel
      selectedId={selectedId}
      onClose={onClose}
      onPick={onPick}
    />
  );
}

function AddressPickerPanel({
  selectedId,
  onClose,
  onPick,
}: Omit<Props, "open">) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);

  // This panel unmounts when the modal closes, so every open starts with
  // loading=true without setting state synchronously inside the effect.
  useEffect(() => {
    let cancelled = false;
    axios
      .get("/api/user/addresses")
      .then((r) => {
        if (!cancelled) setAddresses(r.data.addresses ?? []);
      })
      .catch(() => {
        if (!cancelled) setAddresses([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-950 border border-blue-500/30 rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <h4 className="text-xl font-bold mb-4 text-blue-400">
          Chọn địa chỉ giao hàng
        </h4>

        {loading ? (
          <ClipLoader color="#60a5fa" size={28} />
        ) : addresses.length === 0 ? (
          <p className="text-gray-400 text-sm">
            Bạn chưa có địa chỉ nào. Vào trang Hồ sơ để thêm địa chỉ.
          </p>
        ) : (
          <div className="space-y-3">
            {addresses.map((a) => {
              const active = a._id === selectedId;
              return (
                <button
                  key={a._id}
                  onClick={() => {
                    onPick(a);
                    onClose();
                  }}
                  className={`w-full text-left bg-white/5 border rounded-xl p-4 transition-all ${
                    active
                      ? "border-blue-500"
                      : "border-blue-500/20 hover:border-blue-500/50"
                  }`}
                >
                  <p className="font-semibold text-white">
                    {a.fullName}{" "}
                    <span className="text-gray-400 font-normal">
                      | {a.phone}
                    </span>
                    {a.isDefault && (
                      <span className="ml-2 text-xs bg-blue-600/40 border border-blue-500/40 px-2 py-0.5 rounded-full">
                        Mặc định
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-gray-300 mt-1">
                    {a.addressDetail}, {a.wardName}, {a.districtName},{" "}
                    {a.provinceName}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-6 w-full py-3 rounded-lg border border-gray-600 hover:bg-white/5 text-sm"
        >
          Đóng
        </button>
      </div>
    </div>
  );
}
