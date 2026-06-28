"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaTicketAlt } from "react-icons/fa";
import VoucherCard from "@/app/component/VoucherCard";

type Accent = "blue" | "emerald";
type Mode = "admin" | "vendor";
type DiscountType = "fixed" | "percentage" | "freeship";
type Scope = "all" | "products" | "category";

type VoucherStats = {
  walletCount: number;
  collectedCount: number;
  reservedCount: number;
  usedCount: number;
  expiredCount: number;
  ordersApplied: number;
  settledOrders: number;
  cancelledOrders: number;
  settledDiscount: number;
  pendingDiscount: number;
  grossSales: number;
  conversionRate: number;
};

type Voucher = {
  _id: string;
  code: string;
  title: string;
  description?: string;
  discountType: DiscountType;
  discountValue: number;
  maxDiscount?: number;
  minSpend: number;
  totalQuota: number;
  usedQuota: number;
  scope?: Scope;
  applicableProducts?: string[];
  applicableCategories?: string[];
  collectStartAt?: string;
  startAt?: string;
  endAt?: string;
  isActive: boolean;
  stats?: Partial<VoucherStats>;
};

type VoucherFilter =
  | "all"
  | "running"
  | "scheduled"
  | "expiring"
  | "exhausted"
  | "off"
  | "ended";

const FILTER_OPTIONS: { value: VoucherFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "running", label: "Đang chạy" },
  { value: "scheduled", label: "Lên lịch" },
  { value: "expiring", label: "Sắp hết hạn" },
  { value: "exhausted", label: "Hết lượt" },
  { value: "off", label: "Đã tắt" },
  { value: "ended", label: "Đã kết thúc" },
];

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function isExpiringSoon(voucher: Voucher, now = Date.now()) {
  if (!voucher.endAt) return false;
  const end = new Date(voucher.endAt).getTime();
  return end >= now && end - now <= THREE_DAYS_MS;
}

function isExhausted(voucher: Voucher) {
  return voucher.totalQuota > 0 && voucher.usedQuota >= voucher.totalQuota;
}

function money(value: number) {
  return `${Math.round(value).toLocaleString("vi-VN")}₫`;
}

type VendorProduct = { _id: string; title: string };

type VoucherForm = {
  code: string;
  title: string;
  description: string;
  discountType: DiscountType;
  discountValue: string;
  maxDiscount: string;
  minSpend: string;
  totalQuota: string;
  scope: Scope;
  applicableProducts: string[];
  applicableCategoriesText: string;
  collectStartAt: string;
  startAt: string;
  endAt: string;
  isActive: boolean;
};

type Message = { type: "success" | "error"; text: string } | null;

const emptyForm: VoucherForm = {
  code: "",
  title: "",
  description: "",
  discountType: "fixed",
  discountValue: "0",
  maxDiscount: "",
  minSpend: "0",
  totalQuota: "10",
  scope: "all",
  applicableProducts: [],
  applicableCategoriesText: "",
  collectStartAt: "",
  startAt: "",
  endAt: "",
  isActive: true,
};

const accentStyles = {
  blue: {
    icon: "text-blue-400",
    headingBar: "bg-blue-500",
    button:
      "bg-blue-600 hover:bg-blue-500 focus:ring-blue-500/30 disabled:hover:bg-blue-600",
    focus: "focus:border-blue-500 focus:ring-blue-500/30",
    success: "border-blue-500/20 bg-blue-500/10 text-blue-300",
    activeBadge: "bg-blue-500/15 text-blue-300 border-blue-500/25",
    progress: "bg-blue-500",
    softButton: "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30",
  },
  emerald: {
    icon: "text-emerald-400",
    headingBar: "bg-emerald-500",
    button:
      "bg-emerald-600 hover:bg-emerald-500 focus:ring-emerald-500/30 disabled:hover:bg-emerald-600",
    focus: "focus:border-emerald-500 focus:ring-emerald-500/30",
    success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    activeBadge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
    progress: "bg-emerald-500",
    softButton: "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30",
  },
} satisfies Record<Accent, Record<string, string>>;

function inputClass(accent: Accent) {
  return `w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 outline-none transition focus:ring-2 [color-scheme:dark] ${accentStyles[accent].focus}`;
}

function parseCategories(text: string) {
  return [...new Set(text.split(",").map((item) => item.trim()).filter(Boolean))];
}

function validateForm(form: VoucherForm) {
  const discountValue = Number(form.discountValue);
  if (!form.code.trim() || !form.title.trim()) return "Vui lòng nhập mã và tiêu đề";
  if (!Number.isFinite(discountValue) || discountValue < 0) {
    return "Giá trị giảm không hợp lệ";
  }
  if (form.discountType !== "freeship" && discountValue <= 0) {
    return "Giá trị giảm phải lớn hơn 0";
  }
  if (form.discountType === "percentage" && discountValue > 100) {
    return "Voucher phần trăm không được vượt quá 100";
  }
  if (form.discountType !== "fixed" && !(Number(form.maxDiscount) > 0)) {
    return "Voucher phần trăm/freeship cần trần giảm lớn hơn 0";
  }
  if (!form.startAt || !form.endAt) return "Vui lòng chọn thời gian hiệu lực";
  if (new Date(form.endAt) <= new Date(form.startAt)) {
    return "Ngày kết thúc phải sau ngày bắt đầu";
  }
  if (Number(form.totalQuota) <= 0) return "Tổng lượt phải lớn hơn 0";
  if (form.scope === "products" && form.applicableProducts.length === 0) {
    return "Vui lòng chọn ít nhất 1 sản phẩm áp dụng";
  }
  if (form.scope === "category" && parseCategories(form.applicableCategoriesText).length === 0) {
    return "Vui lòng nhập ít nhất 1 danh mục áp dụng";
  }
  return "";
}

function formatDate(value?: string) {
  if (!value) return "Chưa đặt";
  return new Date(value).toLocaleDateString("vi-VN");
}

// ISO -> giá trị cho input datetime-local (theo giờ địa phương).
function toLocalInput(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function discountTypeLabel(type: DiscountType) {
  if (type === "percentage") return "Giảm %";
  if (type === "freeship") return "Freeship";
  return "Giảm tiền";
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="col-span-full mt-2 flex items-center gap-3">
      <h3 className="shrink-0 text-xs font-bold uppercase tracking-wide text-gray-400">
        {children}
      </h3>
      <div className="h-px flex-1 bg-white/10" />
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  accent,
  type = "text",
  suffix,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  accent: Accent;
  type?: string;
  suffix?: string;
  required?: boolean;
}) {
  const hasSuffix = Boolean(suffix);
  return (
    <label className="flex flex-col">
      <span className="mb-1 text-xs font-medium text-gray-400">{label}</span>
      <span className="relative">
        <input
          type={type}
          value={value}
          required={required}
          onChange={(event) => onChange(event.target.value)}
          className={`${inputClass(accent)} ${hasSuffix ? "pr-12 text-right" : ""}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-500">
            {suffix}
          </span>
        )}
      </span>
    </label>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
  accent,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  accent: Accent;
}) {
  return (
    <label className="flex flex-col">
      <span className="mb-1 text-xs font-medium text-gray-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass(accent)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Spinner() {
  return (
    <span className="h-4 w-4 rounded-full border-2 border-white/60 border-t-transparent animate-spin" />
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-white">{value}</p>
    </div>
  );
}

export default function VoucherManager({
  apiBase,
  accent,
  allowFreeship,
  mode,
  title,
  subtitle,
}: {
  apiBase: string;
  accent: Accent;
  allowFreeship: boolean;
  mode: Mode;
  title: string;
  subtitle: string;
}) {
  const styles = accentStyles[accent];
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [form, setForm] = useState<VoucherForm>(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [message, setMessage] = useState<Message>(null);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState("");
  const [filter, setFilter] = useState<VoucherFilter>("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "endingSoon">("newest");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const reqIdRef = useRef(0);

  const scopeOptions = useMemo(
    () =>
      mode === "vendor"
        ? [
            { value: "all", label: "Toàn shop" },
            { value: "products", label: "Sản phẩm chỉ định" },
            { value: "category", label: "Theo danh mục" },
          ]
        : [
            { value: "all", label: "Toàn sàn" },
            { value: "category", label: "Theo danh mục" },
          ],
    [mode],
  );

  // Debounce search.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    async (targetPage: number, replace: boolean) => {
      const reqId = ++reqIdRef.current;
      setListLoading(true);
      try {
        const params = new URLSearchParams({
          state: filter,
          sort,
          page: String(targetPage),
          limit: "24",
        });
        if (query) params.set("q", query);
        const res = await fetch(`${apiBase}?${params.toString()}`);
        const data = await res.json();
        if (reqId !== reqIdRef.current) return;
        const incoming: Voucher[] = data.vouchers ?? [];
        setVouchers((prev) => (replace ? incoming : [...prev, ...incoming]));
        setHasMore(Boolean(data.pagination?.hasMore));
        setPage(targetPage);
      } catch {
        if (reqId === reqIdRef.current && replace) setVouchers([]);
      } finally {
        if (reqId === reqIdRef.current) setListLoading(false);
      }
    },
    [apiBase, filter, sort, query],
  );

  // Đổi filter/sort/query -> reload page 1, clear list cũ.
  useEffect(() => {
    void load(1, true);
  }, [load]);

  // Vendor cần danh sách sản phẩm CỦA shop mình cho scope "products".
  useEffect(() => {
    if (mode !== "vendor") return;
    let cancelled = false;
    (async () => {
      try {
        const meRes = await fetch("/api/user/currentUser");
        const me = await meRes.json();
        const myId = String(me?.user?._id ?? "");
        const res = await fetch("/api/vendor/allProduct");
        const all = await res.json();
        const list: VendorProduct[] = (Array.isArray(all) ? all : [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((p: any) => String(p?.vendor?._id ?? p?.vendor ?? "") === myId)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((p: any) => ({ _id: String(p._id), title: p.title }));
        if (!cancelled) setProducts(list);
      } catch {
        if (!cancelled) setProducts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const discountLabel = useMemo(() => {
    if (form.discountType === "percentage") return "Phần trăm giảm";
    if (form.discountType === "freeship") return "Mức freeship";
    return "Số tiền giảm";
  }, [form.discountType]);

  const discountSuffix = form.discountType === "percentage" ? "%" : "₫";
  const showMaxDiscount = form.discountType !== "fixed";
  const previewVoucher = {
    _id: "preview",
    code: form.code || "VOUCHER",
    title: form.title || "Tiêu đề voucher",
    description: form.description || undefined,
    discountType: form.discountType,
    discountValue: Number(form.discountValue) || 0,
    maxDiscount: form.maxDiscount === "" ? undefined : Number(form.maxDiscount),
    minSpend: Number(form.minSpend) || 0,
    endAt: form.endAt || undefined,
  };

  const resetForm = () => {
    setEditingId("");
    setForm(emptyForm);
  };

  const startEdit = (voucher: Voucher) => {
    setMessage(null);
    setEditingId(voucher._id);
    setForm({
      code: voucher.code,
      title: voucher.title,
      description: voucher.description ?? "",
      discountType: voucher.discountType,
      discountValue: String(voucher.discountValue),
      maxDiscount: voucher.maxDiscount != null ? String(voucher.maxDiscount) : "",
      minSpend: String(voucher.minSpend),
      totalQuota: String(voucher.totalQuota),
      scope: voucher.scope ?? "all",
      applicableProducts: voucher.applicableProducts ?? [],
      applicableCategoriesText: (voucher.applicableCategories ?? []).join(", "),
      collectStartAt: toLocalInput(voucher.collectStartAt),
      startAt: toLocalInput(voucher.startAt),
      endAt: toLocalInput(voucher.endAt),
      isActive: voucher.isActive,
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const validationError = validateForm(form);
    if (validationError) {
      setMessage({ type: "error", text: validationError });
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        code: form.code,
        title: form.title,
        description: form.description || undefined,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        maxDiscount: form.maxDiscount === "" ? undefined : Number(form.maxDiscount),
        minSpend: Number(form.minSpend),
        totalQuota: Number(form.totalQuota),
        scope: form.scope,
        applicableProducts: form.scope === "products" ? form.applicableProducts : [],
        applicableCategories:
          form.scope === "category" ? parseCategories(form.applicableCategoriesText) : [],
        collectStartAt: form.collectStartAt || undefined,
        startAt: form.startAt,
        endAt: form.endAt,
        isActive: form.isActive,
      };
      const res = await fetch(editingId ? `${apiBase}/${editingId}` : apiBase, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.message ?? "Lưu voucher thất bại" });
        return;
      }
      setMessage({ type: "success", text: editingId ? "Đã cập nhật voucher" : "Đã tạo voucher" });
      resetForm();
      await load(1, true);
    } catch {
      setMessage({ type: "error", text: "Không thể lưu voucher" });
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = async (voucher: Voucher) => {
    if (togglingId) return;
    setTogglingId(voucher._id);
    setMessage(null);
    try {
      const res = await fetch(`${apiBase}/${voucher._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !voucher.isActive }),
      });
      if (!res.ok) throw new Error("Toggle failed");
      await load(1, true);
    } catch {
      setMessage({ type: "error", text: "Không thể cập nhật trạng thái voucher" });
    } finally {
      setTogglingId("");
    }
  };

  const toggleProduct = (productId: string) => {
    setForm((prev) => ({
      ...prev,
      applicableProducts: prev.applicableProducts.includes(productId)
        ? prev.applicableProducts.filter((id) => id !== productId)
        : [...prev.applicableProducts, productId],
    }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold text-white">
          <FaTicketAlt className={styles.icon} />
          {title}
        </h2>
        <p className="mt-1 text-sm text-gray-400">{subtitle}</p>
      </div>

      <form onSubmit={submit} className="rounded-lg border border-white/10 bg-white/5 p-4">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-3 sm:grid-cols-2">
            <SectionTitle>{editingId ? "Sửa voucher" : "Thông tin cơ bản"}</SectionTitle>
            <LabeledInput
              label="Mã voucher"
              value={form.code}
              required
              accent={accent}
              onChange={(value) => setForm({ ...form, code: value.toUpperCase() })}
            />
            <LabeledInput
              label="Tiêu đề"
              value={form.title}
              required
              accent={accent}
              onChange={(value) => setForm({ ...form, title: value })}
            />
            <LabeledInput
              label="Mô tả"
              value={form.description}
              accent={accent}
              onChange={(value) => setForm({ ...form, description: value })}
            />
            <LabeledSelect
              label="Loại giảm giá"
              value={form.discountType}
              accent={accent}
              onChange={(value) =>
                setForm({ ...form, discountType: value as DiscountType, maxDiscount: value === "fixed" ? "" : form.maxDiscount })
              }
              options={[
                { value: "fixed", label: "Giảm tiền" },
                { value: "percentage", label: "Giảm phần trăm" },
                ...(allowFreeship ? [{ value: "freeship", label: "Freeship" }] : []),
              ]}
            />

            <SectionTitle>Giá trị giảm</SectionTitle>
            <LabeledInput
              label={discountLabel}
              value={form.discountValue}
              type="number"
              suffix={discountSuffix}
              required
              accent={accent}
              onChange={(value) => setForm({ ...form, discountValue: value })}
            />
            {showMaxDiscount && (
              <LabeledInput
                label={form.discountType === "freeship" ? "Trần freeship" : "Giảm tối đa"}
                value={form.maxDiscount}
                type="number"
                suffix="₫"
                accent={accent}
                onChange={(value) => setForm({ ...form, maxDiscount: value })}
              />
            )}
            <LabeledInput
              label="Đơn tối thiểu"
              value={form.minSpend}
              type="number"
              suffix="₫"
              accent={accent}
              onChange={(value) => setForm({ ...form, minSpend: value })}
            />

            <SectionTitle>Phạm vi áp dụng</SectionTitle>
            <LabeledSelect
              label="Phạm vi"
              value={form.scope}
              accent={accent}
              onChange={(value) => setForm({ ...form, scope: value as Scope })}
              options={scopeOptions}
            />
            {form.scope === "category" && (
              <LabeledInput
                label="Danh mục áp dụng (phân tách dấu phẩy)"
                value={form.applicableCategoriesText}
                accent={accent}
                onChange={(value) => setForm({ ...form, applicableCategoriesText: value })}
              />
            )}
            {form.scope === "products" && mode === "vendor" && (
              <div className="col-span-full">
                <span className="mb-1 block text-xs font-medium text-gray-400">
                  Sản phẩm áp dụng ({form.applicableProducts.length})
                </span>
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-black/40 p-2">
                  {products.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-gray-500">Chưa có sản phẩm nào.</p>
                  ) : (
                    products.map((product) => (
                      <label
                        key={product._id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-200 hover:bg-white/5"
                      >
                        <input
                          type="checkbox"
                          checked={form.applicableProducts.includes(product._id)}
                          onChange={() => toggleProduct(product._id)}
                          className="h-4 w-4 accent-emerald-500"
                        />
                        <span className="line-clamp-1">{product.title}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}

            <SectionTitle>Giới hạn & thời gian</SectionTitle>
            <LabeledInput
              label="Tổng lượt"
              value={form.totalQuota}
              type="number"
              suffix="lượt"
              accent={accent}
              onChange={(value) => setForm({ ...form, totalQuota: value })}
            />
            <LabeledInput
              label="Bắt đầu cho lưu mã"
              value={form.collectStartAt}
              type="datetime-local"
              accent={accent}
              onChange={(value) => setForm({ ...form, collectStartAt: value })}
            />
            <LabeledInput
              label="Hiệu lực từ"
              value={form.startAt}
              type="datetime-local"
              required
              accent={accent}
              onChange={(value) => setForm({ ...form, startAt: value })}
            />
            <LabeledInput
              label="Hiệu lực đến"
              value={form.endAt}
              type="datetime-local"
              required
              accent={accent}
              onChange={(value) => setForm({ ...form, endAt: value })}
            />
            <label className="col-span-full flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                className="h-4 w-4 accent-emerald-500"
              />
              Kích hoạt voucher ngay
            </label>
          </div>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-lg border border-white/10 bg-black/30 p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">
                Xem trước
              </p>
              <VoucherCard voucher={previewVoucher} accent={accent} />
            </div>
          </aside>
        </div>

        {message && (
          <div
            className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
              message.type === "success"
                ? styles.success
                : "border-red-500/20 bg-red-500/10 text-red-300"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            disabled={submitting}
            className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${styles.button}`}
          >
            {submitting && <Spinner />}
            {submitting ? "Đang lưu..." : editingId ? "Lưu thay đổi" : "Tạo voucher"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-gray-300 hover:bg-white/10"
            >
              Hủy sửa
            </button>
          )}
        </div>
      </form>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm theo mã hoặc tiêu đề..."
          className={`flex-1 ${inputClass(accent)}`}
        />
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as "newest" | "endingSoon")}
          className={`sm:w-44 ${inputClass(accent)}`}
        >
          <option value="newest">Mới nhất</option>
          <option value="endingSoon">Sắp hết hạn</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              filter === option.value
                ? styles.activeBadge
                : "border-white/10 bg-white/5 text-gray-400 hover:text-white"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        {vouchers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 bg-white/5 p-8 text-center text-sm text-gray-400">
            {listLoading ? "Đang tải..." : "Không có voucher khớp bộ lọc."}
          </div>
        ) : (
          vouchers.map((voucher) => {
            const usedRatio =
              voucher.totalQuota > 0
                ? Math.min(100, Math.round((voucher.usedQuota / voucher.totalQuota) * 100))
                : 0;
            return (
              <div
                key={voucher._id}
                className="rounded-lg border border-white/10 bg-white/5 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-white/10 bg-white/10 px-2 py-1 text-[11px] font-bold text-gray-200">
                        {discountTypeLabel(voucher.discountType)}
                      </span>
                      <span
                        className={`rounded-md border px-2 py-1 text-[11px] font-bold ${
                          voucher.isActive
                            ? styles.activeBadge
                            : "border-gray-500/20 bg-gray-500/10 text-gray-400"
                        }`}
                      >
                        {voucher.isActive ? "Đang chạy" : "Tắt"}
                      </span>
                      {voucher.scope && voucher.scope !== "all" && (
                        <span className="rounded-md border border-white/10 bg-white/10 px-2 py-1 text-[11px] font-bold text-gray-300">
                          {voucher.scope === "products" ? "Theo sản phẩm" : "Theo danh mục"}
                        </span>
                      )}
                      {isExhausted(voucher) ? (
                        <span className="rounded-md border border-red-500/25 bg-red-500/10 px-2 py-1 text-[11px] font-bold text-red-300">
                          Hết lượt
                        </span>
                      ) : (
                        voucher.totalQuota > 0 &&
                        voucher.usedQuota / voucher.totalQuota >= 0.9 && (
                          <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[11px] font-bold text-amber-300">
                            Sắp hết lượt
                          </span>
                        )
                      )}
                      {voucher.isActive && isExpiringSoon(voucher) && (
                        <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[11px] font-bold text-amber-300">
                          Sắp hết hạn
                        </span>
                      )}
                    </div>
                    <p className="font-bold text-white">
                      {voucher.code} - {voucher.title}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      Đơn tối thiểu {voucher.minSpend.toLocaleString("vi-VN")}₫ ·{" "}
                      {formatDate(voucher.startAt)} → {formatDate(voucher.endAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(voucher)}
                      className={`rounded-lg px-3 py-2 text-xs font-bold transition ${styles.softButton}`}
                    >
                      Sửa
                    </button>
                    <button
                      type="button"
                      disabled={togglingId === voucher._id}
                      onClick={() => toggle(voucher)}
                      className={`rounded-lg px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        voucher.isActive
                          ? "bg-red-500/20 text-red-300 hover:bg-red-500/30"
                          : styles.softButton
                      }`}
                    >
                      {togglingId === voucher._id ? "Đang xử lý..." : voucher.isActive ? "Tắt" : "Bật"}
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <Kpi label="Đã lưu" value={String(voucher.stats?.walletCount ?? 0)} />
                  <Kpi label="Đã dùng" value={String(voucher.stats?.usedCount ?? 0)} />
                  <Kpi
                    label="Tỷ lệ dùng"
                    value={`${Math.round((voucher.stats?.conversionRate ?? 0) * 100)}%`}
                  />
                  <Kpi label="Đã giảm (chốt)" value={money(voucher.stats?.settledDiscount ?? 0)} />
                  <Kpi
                    label="Quota còn"
                    value={String(Math.max(0, voucher.totalQuota - voucher.usedQuota))}
                  />
                </div>

                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs text-gray-400">
                    <span>Đã dùng</span>
                    <span>
                      {voucher.usedQuota}/{voucher.totalQuota}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full ${styles.progress}`}
                      style={{ width: `${usedRatio}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={listLoading}
            onClick={() => load(page + 1, false)}
            className="rounded-lg border border-white/10 bg-white/5 px-6 py-2.5 text-sm font-semibold text-gray-200 hover:bg-white/10 disabled:opacity-60"
          >
            {listLoading ? "Đang tải..." : "Tải thêm"}
          </button>
        </div>
      )}
    </div>
  );
}
