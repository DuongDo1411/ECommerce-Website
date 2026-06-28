"use client";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useSelector } from "react-redux";
import { motion, AnimatePresence } from "motion/react";
import { RootState } from "@/redux/store";
import ProductCard from "@/app/component/ProductCard";
import { IProduct } from "@/model/product.model";
import { FiSearch, FiX, FiFilter } from "react-icons/fi";
import {
  LuShirt,
  LuSmartphone,
  LuHouse,
  LuSparkles,
  LuGamepad2,
  LuShoppingBasket,
  LuDumbbell,
  LuCar,
  LuGift,
  LuBookOpen,
  LuPackage,
  LuLayoutGrid,
} from "react-icons/lu";

const CATEGORIES: { label: string; Icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { label: "Fashion & Lifestyle",    Icon: LuShirt },
  { label: "Electronics & Gadgets",  Icon: LuSmartphone },
  { label: "Home & Living",          Icon: LuHouse },
  { label: "Beauty & Personal Care", Icon: LuSparkles },
  { label: "Toys, Kids & Baby",      Icon: LuGamepad2 },
  { label: "Food & Grocery",         Icon: LuShoppingBasket },
  { label: "Sports & Fitness",       Icon: LuDumbbell },
  { label: "Automotive Accessories", Icon: LuCar },
  { label: "Gifts & Handcrafts",     Icon: LuGift },
  { label: "Books & Stationery",     Icon: LuBookOpen },
  { label: "Other",                  Icon: LuPackage },
];

type SortKey = "default" | "price-asc" | "price-desc" | "newest";

/** Exactly the product fields this page reads. */
type CategoryProduct = {
  _id: string | { toString(): string };
  title?: string;
  description?: string;
  price: number;
  category?: string;
  isActive?: boolean;
  verificationStatus?: "pending" | "approved" | "rejected";
  createdAt?: string | Date;
};

/* ─── Sidebar content (shared between desktop & mobile drawer) ─── */
function SidebarContent({
  allProductsData,
  activeCat,
  hasFilter,
  onSelectCategory,
  onClose,
  onClearAll,
}: {
  allProductsData: CategoryProduct[];
  activeCat: string;
  hasFilter: boolean;
  onSelectCategory: (label: string | null) => void;
  onClose: () => void;
  onClearAll: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-5 border-b border-white/10 flex items-center justify-between">
        <div>
          <div className="h-0.5 w-8 bg-linear-to-r from-blue-500 to-blue-600 mb-2 rounded-full" />
          <h2 className="text-white font-bold text-base tracking-tight">Danh mục</h2>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <FiX size={18} />
        </button>
      </div>

      {/* Category list */}
      <nav className="flex-1 overflow-y-auto py-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {/* All */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onSelectCategory(null)}
          className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all duration-200 relative group ${
            !activeCat
              ? "text-blue-400 bg-blue-500/10"
              : "text-gray-400 hover:text-white hover:bg-white/5"
          }`}
        >
          {/* Active indicator bar */}
          {!activeCat && (
            <motion.span
              layoutId="sidebar-active"
              className="absolute left-0 top-1 bottom-1 w-0.5 bg-blue-500 rounded-r-full"
            />
          )}
          <LuLayoutGrid size={18} />
          <span>Tất cả sản phẩm</span>
          {!activeCat && (
            <span className="ml-auto text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
              {Array.isArray(allProductsData)
                ? allProductsData.filter(
                    (p) => p.isActive && p.verificationStatus === "approved"
                  ).length
                : 0}
            </span>
          )}
        </motion.button>

        {/* Divider */}
        <div className="mx-4 my-2 border-t border-white/8" />

        {/* Categories */}
        {CATEGORIES.map((cat) => {
          const count = Array.isArray(allProductsData)
            ? allProductsData.filter(
                (p) =>
                  p.isActive &&
                  p.verificationStatus === "approved" &&
                  p.category === cat.label
              ).length
            : 0;
          const isActive = activeCat === cat.label;

          return (
            <motion.button
              key={cat.label}
              whileTap={{ scale: 0.97 }}
              onClick={() => onSelectCategory(cat.label)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all duration-200 relative ${
                isActive
                  ? "text-blue-400 bg-blue-500/10"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute left-0 top-1 bottom-1 w-0.5 bg-blue-500 rounded-r-full"
                />
              )}
              <cat.Icon size={17} />
              <span className="flex-1 text-left leading-snug">{cat.label}</span>
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  isActive
                    ? "bg-blue-500/20 text-blue-400"
                    : "bg-white/8 text-gray-500"
                }`}>
                  {count}
                </span>
              )}
            </motion.button>
          );
        })}
      </nav>

      {/* Clear filter button at bottom */}
      {hasFilter && (
        <div className="px-4 py-3 border-t border-white/10">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onClearAll}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-white/20 text-sm transition-all duration-200"
          >
            <FiX size={13} /> Xóa bộ lọc
          </motion.button>
        </div>
      )}
    </div>
  );
}

export default function CategoryPageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const allProductsData = useSelector(
    (state: RootState) => state?.vendor?.allProductsData ?? []
  );

  const [localSearch, setLocalSearch] = useState(searchParams.get("q") ?? "");
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeCat = decodeURIComponent(searchParams.get("cat") ?? "");
  const activeQ = searchParams.get("q") ?? "";

  // Sync localSearch on back/forward navigation without a set-state-in-effect.
  // React's supported "adjust state when a value changes" pattern: track the
  // previous URL `q` in state and reconcile during render (no effect). When the
  // URL's `q` changes externally (browser back/forward, chip clear), mirror it
  // into the controlled input; normal typing leaves it untouched.
  const [prevUrlQ, setPrevUrlQ] = useState(activeQ);
  if (prevUrlQ !== activeQ) {
    setPrevUrlQ(activeQ);
    setLocalSearch(activeQ);
  }

  // Prevent body scroll when mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen]);

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (!v) params.delete(k);
        else params.set(k, v);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  const handleSearch = (value: string) => {
    setLocalSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParams({ q: value || null });
    }, 300);
  };

  const handleCatSelect = (label: string | null) => {
    // Close the mobile drawer when a category is selected (was previously an
    // effect keyed on activeCat). Selecting a category on mobile closes the drawer.
    setSidebarOpen(false);
    updateParams({ cat: label });
  };

  const clearAll = () => {
    setSidebarOpen(false);
    setLocalSearch("");
    updateParams({ q: null, cat: null });
  };

  const products = allProductsData as CategoryProduct[];

  const filtered = useMemo(() => {
    const q = activeQ.trim().toLowerCase();
    const cat = activeCat;
    const source = allProductsData as CategoryProduct[];

    let result = Array.isArray(source)
      ? source.filter(
          (p) => p.isActive === true && p.verificationStatus === "approved"
        )
      : [];

    if (cat) result = result.filter((p) => p.category === cat);
    if (q)
      result = result.filter(
        (p) =>
          p.title?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
      );

    if (sortKey === "price-asc")  result = [...result].sort((a, b) => a.price - b.price);
    if (sortKey === "price-desc") result = [...result].sort((a, b) => b.price - a.price);
    if (sortKey === "newest")
      result = [...result].sort(
        (a, b) =>
          new Date(b.createdAt ?? 0).getTime() -
          new Date(a.createdAt ?? 0).getTime()
      );

    return result;
  }, [allProductsData, activeCat, activeQ, sortKey]);

  const hasFilter = !!activeCat || !!activeQ;

  return (
    <section className="min-h-screen bg-linear-to-br from-gray-900 via-black to-gray-900">

      {/* ─── Page header ─── */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="max-w-7xl mx-auto px-4 pt-8 pb-6 text-center"
      >
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.7 }}
          className="h-1 w-16 bg-linear-to-r from-blue-500 to-blue-600 mx-auto mb-4 rounded-full"
        />
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
          Danh mục sản phẩm
        </h1>
        <p className="text-gray-400 text-sm sm:text-base mt-2">
          Khám phá sản phẩm từ tất cả danh mục
        </p>
      </motion.div>

      {/* ─── Main layout: sidebar + content ─── */}
      <div className="max-w-7xl mx-auto px-4 pb-16 flex gap-6 items-start">

        {/* ── Desktop sidebar (lg+) ── */}
        <aside className="hidden lg:flex flex-col w-56 xl:w-64 shrink-0 sticky top-20 max-h-[calc(100vh-5.5rem)] bg-gray-900/60 border border-white/10 rounded-2xl overflow-hidden">
          <SidebarContent
            allProductsData={products}
            activeCat={activeCat}
            hasFilter={hasFilter}
            onSelectCategory={handleCatSelect}
            onClose={() => setSidebarOpen(false)}
            onClearAll={clearAll}
          />
        </aside>

        {/* ── Mobile backdrop ── */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
            />
          )}
        </AnimatePresence>

        {/* ── Mobile drawer ── */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.aside
              key="drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="fixed top-0 left-0 h-full w-72 z-50 lg:hidden bg-gray-950 border-r border-white/10 flex flex-col"
            >
              <SidebarContent
                allProductsData={products}
                activeCat={activeCat}
                hasFilter={hasFilter}
                onSelectCategory={handleCatSelect}
                onClose={() => setSidebarOpen(false)}
                onClearAll={clearAll}
              />
            </motion.aside>
          )}
        </AnimatePresence>

        {/* ── Content area ── */}
        <div className="flex-1 min-w-0">

          {/* Sticky search + sort + mobile filter button */}
          <div className="sticky top-16 z-30 bg-gray-950/90 backdrop-blur-md border border-white/10 rounded-2xl mb-5 px-4 py-3 flex gap-3 items-center">
            {/* Mobile filter button */}
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/15 text-gray-300 hover:text-white hover:border-white/25 text-sm transition-all duration-200 relative"
            >
              <FiFilter size={15} />
              {activeCat && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-blue-500 text-white text-[9px] flex items-center justify-center font-bold">
                  1
                </span>
              )}
            </motion.button>

            {/* Search input */}
            <div className="relative flex-1">
              <FiSearch
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                size={15}
              />
              <input
                type="text"
                value={localSearch}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Tìm kiếm sản phẩm..."
                className="w-full pl-9 pr-8 py-2.5 bg-white/5 border border-white/15 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all duration-200 text-sm"
              />
              {localSearch && (
                <button
                  onClick={() => handleSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                >
                  <FiX size={13} />
                </button>
              )}
            </div>

            {/* Sort select */}
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="shrink-0 px-3 py-2.5 bg-white/5 border border-white/15 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all duration-200 cursor-pointer"
            >
              <option value="default"    className="bg-gray-900">Mặc định</option>
              <option value="price-asc"  className="bg-gray-900">Giá tăng dần</option>
              <option value="price-desc" className="bg-gray-900">Giá giảm dần</option>
              <option value="newest"     className="bg-gray-900">Mới nhất</option>
            </select>
          </div>

          {/* Active filter chips (mobile — shows selected category as a chip) */}
          <AnimatePresence>
            {hasFilter && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 flex flex-wrap gap-2 overflow-hidden"
              >
                {activeCat && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 text-xs font-medium">
                    {(() => { const C = CATEGORIES.find((c) => c.label === activeCat)?.Icon; return C ? <C size={11} /> : null; })()}
                    {activeCat}
                    <button onClick={() => handleCatSelect(null)} className="hover:text-white transition-colors ml-0.5">
                      <FiX size={11} />
                    </button>
                  </span>
                )}
                {activeQ && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/8 border border-white/15 text-gray-300 text-xs font-medium">
                    🔍 &ldquo;{activeQ}&rdquo;
                    <button onClick={() => handleSearch("")} className="hover:text-white transition-colors ml-0.5">
                      <FiX size={11} />
                    </button>
                  </span>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Result count */}
          <div className="mb-4 flex items-center gap-2">
            <p className="text-sm text-gray-400">
              <span className="text-blue-400 font-semibold text-base">{filtered.length}</span>{" "}
              sản phẩm
              {activeCat && <span> trong &ldquo;{activeCat}&rdquo;</span>}
            </p>
          </div>

          {/* Product grid */}
          <AnimatePresence mode="popLayout">
            {filtered.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="py-24 flex flex-col items-center gap-4 text-center"
              >
                <span className="text-6xl">🔍</span>
                <p className="text-gray-400 text-lg font-medium">
                  Không tìm thấy sản phẩm nào
                </p>
                <p className="text-gray-600 text-sm">
                  Thử đổi danh mục hoặc từ khóa tìm kiếm
                </p>
                {hasFilter && (
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={clearAll}
                    className="mt-2 px-5 py-2 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400 text-sm font-medium hover:bg-blue-600/30 transition-all duration-200"
                  >
                    Xóa bộ lọc
                  </motion.button>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="grid"
                className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4"
              >
                {filtered.map((p, index) => (
                  <motion.div
                    key={String(p._id)}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{
                      duration: 0.3,
                      delay: Math.min(index * 0.04, 0.3),
                    }}
                  >
                    <ProductCard product={p as unknown as IProduct} />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
