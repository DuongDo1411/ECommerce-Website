"use client";
import { AnimatePresence, motion } from "motion/react";
import React, { useEffect, useState } from "react";
import {
  AiOutlineShop,
  AiOutlineHome,
  AiOutlineFileText,
} from "react-icons/ai";
import { ClipLoader } from "react-spinners";
import axios from "axios";
import { useRouter } from "next/navigation";

interface GhnOption {
  id: string | number;
  name: string;
}

interface GhnProvince {
  ProvinceID: number;
  ProvinceName: string;
}

interface GhnDistrict {
  DistrictID: number;
  DistrictName: string;
}

interface GhnWard {
  WardCode: string | number;
  WardName: string;
}

function EditVendorDetails() {
  const [shopName, setShopName] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const [provinces, setProvinces] = useState<GhnOption[]>([]);
  const [districts, setDistricts] = useState<GhnOption[]>([]);
  const [wards, setWards] = useState<GhnOption[]>([]);
  const [sel, setSel] = useState({
    provinceId: 0,
    provinceName: "",
    districtId: 0,
    districtName: "",
    wardCode: "",
    wardName: "",
  });

  useEffect(() => {
    axios
      .get("/api/ghn/provinces")
      .then((r) =>
        setProvinces(
          r.data.provinces.map((p: GhnProvince) => ({
            id: p.ProvinceID,
            name: p.ProvinceName,
          })),
        ),
      )
      .catch(() => {});
  }, []);

  const onProvince = async (id: number, name: string) => {
    setSel((s) => ({
      ...s,
      provinceId: id,
      provinceName: name,
      districtId: 0,
      districtName: "",
      wardCode: "",
      wardName: "",
    }));
    setWards([]);
    setDistricts([]);
    if (!id) return;
    const r = await axios.get(`/api/ghn/districts?provinceId=${id}`);
    setDistricts(
      r.data.districts.map((d: GhnDistrict) => ({
        id: d.DistrictID,
        name: d.DistrictName,
      })),
    );
  };

  const onDistrict = async (id: number, name: string) => {
    setSel((s) => ({
      ...s,
      districtId: id,
      districtName: name,
      wardCode: "",
      wardName: "",
    }));
    setWards([]);
    if (!id) return;
    const r = await axios.get(`/api/ghn/wards?districtId=${id}`);
    setWards(
      r.data.wards.map((w: GhnWard) => ({
        id: String(w.WardCode),
        name: w.WardName,
      })),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !shopName ||
      !taxNumber ||
      !addressDetail ||
      !sel.provinceId ||
      !sel.districtId ||
      !sel.wardCode
    ) {
      alert("Vui lòng điền đầy đủ thông tin (gồm Tỉnh / Quận / Phường)");
      return;
    }
    setLoading(true);
    try {
      const shopAddress = `${addressDetail}, ${sel.wardName}, ${sel.districtName}, ${sel.provinceName}`;
      await axios.post("/api/vendor/editDetails", {
        shopName,
        taxNumber,
        shopAddress,
        shopAddressDetail: {
          address: addressDetail,
          wardCode: sel.wardCode,
          wardName: sel.wardName,
          districtId: sel.districtId,
          districtName: sel.districtName,
          provinceId: sel.provinceId,
          provinceName: sel.provinceName,
        },
      });
      alert("Vendor Shop Details added Successfully");
      setLoading(false);
      router.push("/");
    } catch (error) {
      setLoading(false);
      const fallback = "Lỗi cập nhật thông tin shop";
      const message = axios.isAxiosError<{ message?: string }>(error)
        ? (error.response?.data?.message ?? fallback)
        : fallback;
      alert(message);
    }
  };

  const fieldCls =
    "w-full bg-white/10 border border-white/30 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-white";
  const optCls = "bg-gray-900 text-white";

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-gray-900 via-black to-gray-900 text-white p-6">
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -40 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md bg-white/10 backdrop-blur-md rounded-3xl shadow-xl p-8 border border-white/10"
        >
          <h3 className="text-3xl font-semibold text-center mb-4">
            Complete Your Shop Details
          </h3>
          <p className="text-center text-gray-300 mb-6 text-sm">
            Địa chỉ kho dùng để GHN lấy hàng — chọn chính xác Tỉnh / Quận /
            Phường
          </p>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="relative">
              <AiOutlineShop
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={22}
              />
              <input
                type="text"
                placeholder="Shop Name"
                className={`${fieldCls} pl-10`}
                onChange={(e) => setShopName(e.target.value)}
                value={shopName}
              />
            </div>

            <select
              className={fieldCls}
              value={sel.provinceId || ""}
              onChange={(e) => {
                const o = provinces.find(
                  (p) => String(p.id) === e.target.value,
                );
                onProvince(Number(e.target.value), o?.name ?? "");
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
              className={fieldCls}
              value={sel.districtId || ""}
              disabled={!sel.provinceId}
              onChange={(e) => {
                const o = districts.find(
                  (d) => String(d.id) === e.target.value,
                );
                onDistrict(Number(e.target.value), o?.name ?? "");
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
              className={fieldCls}
              value={sel.wardCode || ""}
              disabled={!sel.districtId}
              onChange={(e) => {
                const o = wards.find((w) => String(w.id) === e.target.value);
                setSel((s) => ({
                  ...s,
                  wardCode: e.target.value,
                  wardName: o?.name ?? "",
                }));
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

            <div className="relative">
              <AiOutlineHome
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={22}
              />
              <input
                type="text"
                placeholder="Địa chỉ chi tiết (số nhà, đường)"
                className={`${fieldCls} pl-10`}
                onChange={(e) => setAddressDetail(e.target.value)}
                value={addressDetail}
              />
            </div>

            <div className="relative">
              <AiOutlineFileText
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={22}
              />
              <input
                type="text"
                placeholder="Tax Number"
                className={`${fieldCls} pl-10`}
                onChange={(e) => setTaxNumber(e.target.value)}
                value={taxNumber}
              />
            </div>

            <motion.button
              disabled={loading}
              type="submit"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="w-full py-4 flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold text-lg shadow-lg shadow-blue-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <ClipLoader color="white" size={24} />
              ) : (
                <span className="flex items-center gap-2">
                  Submit Now <span className="text-xl">→</span>
                </span>
              )}
            </motion.button>
          </form>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default EditVendorDetails;
