"use client";
import axios from "axios";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import {
  FaCheck,
  FaFloppyDisk,
  FaLocationDot,
  FaMapLocationDot,
  FaPen,
  FaPhone,
  FaPlus,
  FaTag,
  FaTrash,
  FaUser,
  FaXmark,
} from "react-icons/fa6";
import { ClipLoader } from "react-spinners";

export interface Address {
  _id: string;
  label?: string;
  fullName: string;
  phone: string;
  provinceId: number;
  provinceName: string;
  districtId: number;
  districtName: string;
  wardCode: string;
  wardName: string;
  addressDetail: string;
  isDefault: boolean;
}

interface GhnOption {
  id: string | number;
  name: string;
}

// Raw GHN master-data rows as returned by the /api/ghn/* endpoints.
interface GhnProvinceResponse {
  ProvinceID: number;
  ProvinceName: string;
}
interface GhnDistrictResponse {
  DistrictID: number;
  DistrictName: string;
}
interface GhnWardResponse {
  WardCode: string | number;
  WardName: string;
}

const emptyForm = {
  label: "",
  fullName: "",
  phone: "",
  addressDetail: "",
  provinceId: 0,
  provinceName: "",
  districtId: 0,
  districtName: "",
  wardCode: "",
  wardName: "",
  isDefault: false,
};

export default function AddressBook() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const [provinces, setProvinces] = useState<GhnOption[]>([]);
  const [districts, setDistricts] = useState<GhnOption[]>([]);
  const [wards, setWards] = useState<GhnOption[]>([]);

  const loadAddresses = async () => {
    try {
      const res = await axios.get("/api/user/addresses");
      setAddresses(res.data.addresses ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAddresses();
  }, []);

  // Load provinces when the form opens.
  useEffect(() => {
    if (!showForm) return;
    axios
      .get("/api/ghn/provinces")
      .then((r) =>
        setProvinces(
          r.data.provinces.map((p: GhnProvinceResponse) => ({
            id: p.ProvinceID,
            name: p.ProvinceName,
          })),
        ),
      )
      .catch(() => {});
  }, [showForm]);

  const loadDistricts = async (provinceId: number) => {
    const r = await axios.get(`/api/ghn/districts?provinceId=${provinceId}`);
    setDistricts(
      r.data.districts.map((d: GhnDistrictResponse) => ({
        id: d.DistrictID,
        name: d.DistrictName,
      })),
    );
  };

  const loadWards = async (districtId: number) => {
    const r = await axios.get(`/api/ghn/wards?districtId=${districtId}`);
    setWards(
      r.data.wards.map((w: GhnWardResponse) => ({
        id: String(w.WardCode),
        name: w.WardName,
      })),
    );
  };

  const openAdd = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setDistricts([]);
    setWards([]);
    setShowForm(true);
  };

  const openEdit = async (a: Address) => {
    setForm({
      label: a.label ?? "",
      fullName: a.fullName,
      phone: a.phone,
      addressDetail: a.addressDetail,
      provinceId: a.provinceId,
      provinceName: a.provinceName,
      districtId: a.districtId,
      districtName: a.districtName,
      wardCode: a.wardCode,
      wardName: a.wardName,
      isDefault: a.isDefault,
    });
    setEditingId(a._id);
    setShowForm(true);
    await loadDistricts(a.provinceId);
    await loadWards(a.districtId);
  };

  const handleProvince = async (id: number, name: string) => {
    setForm((f) => ({
      ...f,
      provinceId: id,
      provinceName: name,
      districtId: 0,
      districtName: "",
      wardCode: "",
      wardName: "",
    }));
    setWards([]);
    if (id) await loadDistricts(id);
  };

  const handleDistrict = async (id: number, name: string) => {
    setForm((f) => ({
      ...f,
      districtId: id,
      districtName: name,
      wardCode: "",
      wardName: "",
    }));
    if (id) await loadWards(id);
  };

  const handleSave = async () => {
    if (
      !form.fullName ||
      !form.phone ||
      !form.provinceId ||
      !form.districtId ||
      !form.wardCode ||
      !form.addressDetail
    ) {
      alert("Vui lòng điền đầy đủ thông tin địa chỉ");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await axios.patch(`/api/user/addresses/${editingId}`, form);
      } else {
        await axios.post("/api/user/addresses", form);
      }
      setShowForm(false);
      await loadAddresses();
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.message as string | undefined)
        : undefined;
      alert(message ?? "Lưu địa chỉ thất bại");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Xóa địa chỉ này?")) return;
    await axios.delete(`/api/user/addresses/${id}`);
    await loadAddresses();
  };

  const handleSetDefault = async (id: string) => {
    await axios.patch(`/api/user/addresses/${id}/default`);
    await loadAddresses();
  };

  const inputCls =
    "w-full py-3 pl-11 pr-4 bg-gray-900/60 border border-white/10 rounded-xl focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/15 focus:outline-none transition-all text-white placeholder-gray-500";
  const selectCls =
    "w-full px-3 py-3 bg-gray-900/60 border border-white/10 rounded-xl focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/15 focus:outline-none transition-all text-white disabled:opacity-50 disabled:cursor-not-allowed";
  // Native <option> list ignores parent dark theme; force dark bg + light text.
  const optCls = "bg-gray-900 text-white";

  return (
    <div className="mt-10 bg-linear-to-br from-white/[0.075] to-white/[0.035] p-6 sm:p-8 rounded-2xl border border-white/10 shadow-xl shadow-black/25">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center">
            <FaMapLocationDot className="text-blue-400" size={15} />
          </div>
          <h3 className="text-2xl font-bold text-white">Sổ địa chỉ</h3>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center justify-center gap-2 bg-linear-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-blue-500/10 transition-all"
        >
          <FaPlus size={12} />
          Thêm địa chỉ
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <ClipLoader color="#60a5fa" size={28} />
        </div>
      ) : addresses.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-6 text-center">
          <p className="text-gray-400 text-sm">Chưa có địa chỉ nào.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map((a) => (
            <div
              key={a._id}
              className="group bg-white/5 hover:bg-white/[0.07] border border-blue-500/15 hover:border-blue-500/35 rounded-xl p-4 transition-all duration-200 hover:-translate-y-0.5"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center shrink-0 mt-0.5">
                  <FaLocationDot className="text-blue-400" size={14} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-white">{a.fullName}</p>
                    <span className="text-sm text-gray-400">| {a.phone}</span>
                    {a.label && (
                      <span className="text-[11px] text-gray-300 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                        {a.label}
                      </span>
                    )}
                    {a.isDefault && (
                      <span className="text-[11px] bg-blue-500/15 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full">
                        Mặc định
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-300 mt-1.5 leading-relaxed">
                    {a.addressDetail}, {a.wardName}, {a.districtName},{" "}
                    {a.provinceName}
                  </p>

                  <div className="flex flex-wrap gap-2 mt-3 text-sm">
                    {!a.isDefault && (
                      <button
                        onClick={() => handleSetDefault(a._id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/15 border border-blue-500/25 text-blue-300 transition-colors"
                      >
                        <FaCheck size={11} />
                        Đặt mặc định
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(a)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 transition-colors"
                    >
                      <FaPen size={11} />
                      Sửa
                    </button>
                    <button
                      onClick={() => handleDelete(a._id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/15 border border-red-500/25 text-red-300 transition-colors"
                    >
                      <FaTrash size={11} />
                      Xóa
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setShowForm(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              transition={{ type: "spring", stiffness: 280, damping: 24 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl max-h-[90vh] overflow-hidden bg-gray-950 border border-white/10 rounded-2xl shadow-2xl"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center">
                    <FaMapLocationDot className="text-blue-400" size={15} />
                  </div>
                  <h4 className="text-base font-bold text-white">
                    {editingId ? "Sửa địa chỉ" : "Thêm địa chỉ mới"}
                  </h4>
                </div>
                <button
                  onClick={() => setShowForm(false)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <FaXmark size={18} />
                </button>
              </div>

              <div className="max-h-[calc(90vh-137px)] overflow-y-auto px-6 py-5 space-y-4">
                <div>
                  <label className="text-[11px] text-gray-500 uppercase font-bold tracking-widest mb-2 block">
                    Nhãn
                  </label>
                  <div className="relative group">
                    <FaTag className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors" size={14} />
                    <input
                      className={inputCls}
                      placeholder="Nhà / Công ty"
                      value={form.label}
                      onChange={(e) =>
                        setForm({ ...form, label: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-gray-500 uppercase font-bold tracking-widest mb-2 block">
                      Họ tên người nhận
                    </label>
                    <div className="relative group">
                      <FaUser className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors" size={14} />
                      <input
                        className={inputCls}
                        placeholder="Nhập họ tên"
                        value={form.fullName}
                        onChange={(e) =>
                          setForm({ ...form, fullName: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-gray-500 uppercase font-bold tracking-widest mb-2 block">
                      Số điện thoại
                    </label>
                    <div className="relative group">
                      <FaPhone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors" size={14} />
                      <input
                        className={inputCls}
                        placeholder="VD: 0901234567"
                        value={form.phone}
                        onChange={(e) =>
                          setForm({ ...form, phone: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-gray-500 uppercase font-bold tracking-widest mb-2 block">
                      Tỉnh / Thành phố
                    </label>
                    <select
                      className={selectCls}
                      value={form.provinceId || ""}
                      onChange={(e) => {
                        const opt = provinces.find(
                          (p) => String(p.id) === e.target.value,
                        );
                        handleProvince(Number(e.target.value), opt?.name ?? "");
                      }}
                    >
                      <option className={optCls} value="">
                        Chọn tỉnh
                      </option>
                      {provinces.map((p) => (
                        <option className={optCls} key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-gray-500 uppercase font-bold tracking-widest mb-2 block">
                      Quận / Huyện
                    </label>
                    <select
                      className={selectCls}
                      value={form.districtId || ""}
                      disabled={!form.provinceId}
                      onChange={(e) => {
                        const opt = districts.find(
                          (d) => String(d.id) === e.target.value,
                        );
                        handleDistrict(Number(e.target.value), opt?.name ?? "");
                      }}
                    >
                      <option className={optCls} value="">
                        Chọn quận
                      </option>
                      {districts.map((d) => (
                        <option className={optCls} key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-gray-500 uppercase font-bold tracking-widest mb-2 block">
                      Phường / Xã
                    </label>
                    <select
                      className={selectCls}
                      value={form.wardCode || ""}
                      disabled={!form.districtId}
                      onChange={(e) => {
                        const opt = wards.find(
                          (w) => String(w.id) === e.target.value,
                        );
                        setForm({
                          ...form,
                          wardCode: e.target.value,
                          wardName: opt?.name ?? "",
                        });
                      }}
                    >
                      <option className={optCls} value="">
                        Chọn phường
                      </option>
                      {wards.map((w) => (
                        <option className={optCls} key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-gray-500 uppercase font-bold tracking-widest mb-2 block">
                    Địa chỉ chi tiết
                  </label>
                  <div className="relative group">
                    <FaLocationDot className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors" size={14} />
                    <input
                      className={inputCls}
                      placeholder="Số nhà, ngõ, ngách"
                      value={form.addressDetail}
                      onChange={(e) =>
                        setForm({ ...form, addressDetail: e.target.value })
                      }
                    />
                  </div>
                </div>

                <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={form.isDefault}
                    onChange={(e) =>
                      setForm({ ...form, isDefault: e.target.checked })
                    }
                    className="h-4 w-4 accent-blue-500"
                  />
                  Đặt làm địa chỉ mặc định
                </label>
              </div>

              <div className="flex gap-3 px-6 py-4 border-t border-white/10 bg-white/[0.03]">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-3 rounded-xl border border-white/10 hover:bg-white/5 text-gray-300 hover:text-white transition-colors"
                >
                  Hủy
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl bg-linear-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 disabled:from-gray-600 disabled:to-gray-500 font-semibold shadow-lg shadow-blue-500/10 transition-all flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <ClipLoader color="white" size={18} />
                  ) : (
                    <>
                      <FaFloppyDisk size={14} />
                      Lưu
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
