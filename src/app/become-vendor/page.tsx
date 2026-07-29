"use client";

import axios from "axios";
import { signOut } from "next-auth/react";
import { useEffect, useState, type FormEvent } from "react";

type Option = { id: string | number; name: string };
type Province = { ProvinceID: number; ProvinceName: string };
type District = { DistrictID: number; DistrictName: string };
type Ward = { WardCode: string | number; WardName: string };

export default function BecomeVendorPage() {
  const [loaded, setLoaded] = useState(false);
  const [phone, setPhone] = useState("");
  const [shopName, setShopName] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [address, setAddress] = useState("");
  const [province, setProvince] = useState({ id: 0, name: "" });
  const [district, setDistrict] = useState({ id: 0, name: "" });
  const [ward, setWard] = useState({ code: "", name: "" });
  const [provinces, setProvinces] = useState<Option[]>([]);
  const [districts, setDistricts] = useState<Option[]>([]);
  const [wards, setWards] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [me, provinceRes] = await Promise.all([
          axios.get("/api/user/currentUser"),
          axios.get("/api/ghn/provinces"),
        ]);
        if (!active) return;
        setPhone(me.data?.user?.phone ?? "");
        setProvinces(
          (provinceRes.data.provinces ?? []).map((item: Province) => ({
            id: item.ProvinceID,
            name: item.ProvinceName,
          })),
        );
      } catch {
        if (active) setMessage("Không thể tải dữ liệu. Vui lòng thử lại.");
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const selectProvince = async (id: number, name: string) => {
    setProvince({ id, name });
    setDistrict({ id: 0, name: "" });
    setWard({ code: "", name: "" });
    setDistricts([]);
    setWards([]);
    if (!id) return;
    const res = await axios.get(`/api/ghn/districts?provinceId=${id}`);
    setDistricts(
      (res.data.districts ?? []).map((item: District) => ({
        id: item.DistrictID,
        name: item.DistrictName,
      })),
    );
  };

  const selectDistrict = async (id: number, name: string) => {
    setDistrict({ id, name });
    setWard({ code: "", name: "" });
    setWards([]);
    if (!id) return;
    const res = await axios.get(`/api/ghn/wards?districtId=${id}`);
    setWards(
      (res.data.wards ?? []).map((item: Ward) => ({
        id: String(item.WardCode),
        name: item.WardName,
      })),
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const payload = {
        phone,
        shopName,
        taxNumber,
        shopAddressDetail: {
          address,
          wardCode: ward.code,
          wardName: ward.name,
          districtId: district.id,
          districtName: district.name,
          provinceId: province.id,
          provinceName: province.name,
        },
      };
      const res = await axios.post("/api/user/become-vendor", payload);
      setMessage(res.data?.message ?? "Đã gửi hồ sơ.");
      // Role changed server-side + sessions revoked → sign out to the vendor portal.
      setTimeout(
        () => signOut({ callbackUrl: res.data?.next ?? "/vendor/login" }),
        1500,
      );
    } catch (error) {
      setMessage(
        axios.isAxiosError<{ message?: string }>(error)
          ? (error.response?.data?.message ?? "Không thể gửi hồ sơ.")
          : "Không thể gửi hồ sơ.",
      );
      setLoading(false);
    }
  };

  const fieldClass =
    "w-full rounded-xl border border-white/10 bg-white/5 p-3 text-white outline-none focus:border-blue-500";

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white">
        Đang tải…
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-6 py-24 text-white">
      <section className="mx-auto w-full max-w-xl rounded-2xl border border-white/10 bg-white/5 p-8">
        <h1 className="mb-2 text-2xl font-bold">Đăng ký mở shop</h1>
        <p className="mb-6 text-sm text-gray-400">
          Điền hồ sơ cửa hàng (địa chỉ GHN đầy đủ). Sau khi gửi, tài khoản
          chuyển sang Người bán ở trạng thái chờ quản trị viên duyệt và bạn cần
          đăng nhập lại bằng cổng Người bán.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <input
            required
            inputMode="numeric"
            maxLength={10}
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
            placeholder="Số điện thoại liên hệ (VD: 0901234567) *"
            className={fieldClass}
          />
          <input
            required
            maxLength={120}
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            placeholder="Tên cửa hàng *"
            className={fieldClass}
          />
          <input
            required
            maxLength={50}
            value={taxNumber}
            onChange={(e) => setTaxNumber(e.target.value)}
            placeholder="Mã số thuế *"
            className={fieldClass}
          />
          <select
            required
            value={province.id || ""}
            className={fieldClass}
            onChange={(e) => {
              const opt = provinces.find(
                (item) => String(item.id) === e.target.value,
              );
              void selectProvince(Number(e.target.value), opt?.name ?? "");
            }}
          >
            <option value="" className="bg-gray-900">
              -- Tỉnh / Thành phố --
            </option>
            {provinces.map((item) => (
              <option key={item.id} value={item.id} className="bg-gray-900">
                {item.name}
              </option>
            ))}
          </select>
          <select
            required
            disabled={!province.id}
            value={district.id || ""}
            className={fieldClass}
            onChange={(e) => {
              const opt = districts.find(
                (item) => String(item.id) === e.target.value,
              );
              void selectDistrict(Number(e.target.value), opt?.name ?? "");
            }}
          >
            <option value="" className="bg-gray-900">
              -- Quận / Huyện --
            </option>
            {districts.map((item) => (
              <option key={item.id} value={item.id} className="bg-gray-900">
                {item.name}
              </option>
            ))}
          </select>
          <select
            required
            disabled={!district.id}
            value={ward.code}
            className={fieldClass}
            onChange={(e) => {
              const opt = wards.find(
                (item) => String(item.id) === e.target.value,
              );
              setWard({ code: e.target.value, name: opt?.name ?? "" });
            }}
          >
            <option value="" className="bg-gray-900">
              -- Phường / Xã --
            </option>
            {wards.map((item) => (
              <option key={item.id} value={item.id} className="bg-gray-900">
                {item.name}
              </option>
            ))}
          </select>
          <input
            required
            maxLength={255}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Số nhà, tên đường *"
            className={fieldClass}
          />
          <button
            disabled={loading}
            type="submit"
            className="w-full rounded-xl bg-blue-600 py-3 font-semibold hover:bg-blue-500 disabled:opacity-60"
          >
            {loading ? "Đang gửi…" : "Gửi hồ sơ mở shop"}
          </button>
        </form>

        {message && <p className="mt-4 text-sm text-gray-300">{message}</p>}
      </section>
    </main>
  );
}
