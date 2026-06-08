"use client";
import axios from "axios";
import { useEffect, useState } from "react";
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
          r.data.provinces.map((p: any) => ({
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
      r.data.districts.map((d: any) => ({
        id: d.DistrictID,
        name: d.DistrictName,
      })),
    );
  };

  const loadWards = async (districtId: number) => {
    const r = await axios.get(`/api/ghn/wards?districtId=${districtId}`);
    setWards(
      r.data.wards.map((w: any) => ({
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
    } catch (e: any) {
      alert(e?.response?.data?.message ?? "Lưu địa chỉ thất bại");
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
    "w-full p-3 bg-white/5 border border-blue-500/20 rounded-lg focus:border-blue-500/50 focus:outline-none text-white placeholder-gray-500";
  // Native <option> list ignores parent dark theme; force dark bg + light text.
  const optCls = "bg-gray-900 text-white";

  return (
    <div className="mt-10 bg-linear-to-br from-white/8 to-white/4 p-6 sm:p-8 rounded-xl border border-blue-500/30">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-bold bg-linear-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
          📍 Sổ địa chỉ
        </h3>
        <button
          onClick={openAdd}
          className="bg-linear-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 px-4 py-2 rounded-lg text-sm font-semibold"
        >
          + Thêm địa chỉ
        </button>
      </div>

      {loading ? (
        <ClipLoader color="#60a5fa" size={28} />
      ) : addresses.length === 0 ? (
        <p className="text-gray-400 text-sm">Chưa có địa chỉ nào.</p>
      ) : (
        <div className="space-y-3">
          {addresses.map((a) => (
            <div
              key={a._id}
              className="bg-white/5 border border-blue-500/20 rounded-xl p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {a.fullName}{" "}
                    <span className="text-gray-400 font-normal">
                      | {a.phone}
                    </span>
                    {a.isDefault && (
                      <span className="ml-2 text-xs bg-blue-600/40 border border-blue-500/40 px-2 py-0.5 rounded-full">
                        Mặc định
                      </span>
                    )}
                    {a.label && (
                      <span className="ml-2 text-xs text-gray-400">
                        ({a.label})
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-gray-300 mt-1">
                    {a.addressDetail}, {a.wardName}, {a.districtName},{" "}
                    {a.provinceName}
                  </p>
                </div>
              </div>
              <div className="flex gap-3 mt-3 text-sm">
                {!a.isDefault && (
                  <button
                    onClick={() => handleSetDefault(a._id)}
                    className="text-blue-400 hover:underline"
                  >
                    Đặt mặc định
                  </button>
                )}
                <button
                  onClick={() => openEdit(a)}
                  className="text-emerald-400 hover:underline"
                >
                  Sửa
                </button>
                <button
                  onClick={() => handleDelete(a._id)}
                  className="text-red-400 hover:underline"
                >
                  Xóa
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-gray-950 border border-blue-500/30 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h4 className="text-xl font-bold mb-4 text-blue-400">
              {editingId ? "Sửa địa chỉ" : "Thêm địa chỉ mới"}
            </h4>
            <div className="space-y-3">
              <input
                className={inputCls}
                placeholder="Nhãn (Nhà / Công ty)"
                value={form.label}
                onChange={(e) =>
                  setForm({ ...form, label: e.target.value })
                }
              />
              <input
                className={inputCls}
                placeholder="Họ tên người nhận"
                value={form.fullName}
                onChange={(e) =>
                  setForm({ ...form, fullName: e.target.value })
                }
              />
              <input
                className={inputCls}
                placeholder="Số điện thoại"
                value={form.phone}
                onChange={(e) =>
                  setForm({ ...form, phone: e.target.value })
                }
              />
              <select
                className={inputCls}
                value={form.provinceId || ""}
                onChange={(e) => {
                  const opt = provinces.find(
                    (p) => String(p.id) === e.target.value,
                  );
                  handleProvince(Number(e.target.value), opt?.name ?? "");
                }}
              >
                <option className={optCls} value="">
                  -- Tỉnh / Thành phố --
                </option>
                {provinces.map((p) => (
                  <option className={optCls} key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select
                className={inputCls}
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
                  -- Quận / Huyện --
                </option>
                {districts.map((d) => (
                  <option className={optCls} key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <select
                className={inputCls}
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
                  -- Phường / Xã --
                </option>
                {wards.map((w) => (
                  <option className={optCls} key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <input
                className={inputCls}
                placeholder="Địa chỉ chi tiết (số nhà, ngõ, ngách)"
                value={form.addressDetail}
                onChange={(e) =>
                  setForm({ ...form, addressDetail: e.target.value })
                }
              />
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) =>
                    setForm({ ...form, isDefault: e.target.checked })
                  }
                />
                Đặt làm địa chỉ mặc định
              </label>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-3 rounded-lg border border-gray-600 hover:bg-white/5"
              >
                Hủy
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-3 rounded-lg bg-linear-to-r from-blue-600 to-blue-500 font-semibold"
              >
                {saving ? <ClipLoader color="white" size={18} /> : "Lưu"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
