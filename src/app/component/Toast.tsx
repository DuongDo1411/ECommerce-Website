"use client";
import { motion, AnimatePresence } from "motion/react";
import { useEffect } from "react";
import { FaCheckCircle, FaTimesCircle, FaInfoCircle, FaTimes } from "react-icons/fa";

export type ToastType = "success" | "error" | "info";

export interface ToastData {
  message: string;
  type: ToastType;
}

interface ToastProps extends ToastData {
  onClose: () => void;
  duration?: number; // ms – default 3500
}

const CONFIG: Record<
  ToastType,
  { Icon: React.ElementType; color: string; border: string; bar: string; glow: string }
> = {
  success: {
    Icon: FaCheckCircle,
    color: "text-green-400",
    border: "border-green-500/35",
    bar: "bg-green-500",
    glow: "shadow-green-900/40",
  },
  error: {
    Icon: FaTimesCircle,
    color: "text-red-400",
    border: "border-red-500/35",
    bar: "bg-red-500",
    glow: "shadow-red-900/40",
  },
  info: {
    Icon: FaInfoCircle,
    color: "text-blue-400",
    border: "border-blue-500/35",
    bar: "bg-blue-500",
    glow: "shadow-blue-900/40",
  },
};

export function Toast({ message, type, onClose, duration = 3500 }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [onClose, duration]);

  const cfg = CONFIG[type];
  const { Icon } = cfg;

  return (
    <motion.div
      initial={{ opacity: 0, y: -28, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -24, scale: 0.92 }}
      transition={{ type: "spring", stiffness: 340, damping: 26 }}
      className={`
        fixed top-5 right-5 z-[9999]
        w-[320px] max-w-[calc(100vw-2.5rem)]
        bg-gray-900 border ${cfg.border}
        rounded-2xl shadow-2xl ${cfg.glow}
        overflow-hidden
      `}
    >
      {/* Body */}
      <div className="flex items-start gap-3 px-4 py-4">
        <Icon size={20} className={`${cfg.color} shrink-0 mt-0.5`} />
        <p className="text-sm text-gray-100 flex-1 leading-snug font-medium">
          {message}
        </p>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-white transition-colors shrink-0 -mt-0.5"
        >
          <FaTimes size={13} />
        </button>
      </div>

      {/* Progress bar */}
      <motion.div
        initial={{ width: "100%" }}
        animate={{ width: "0%" }}
        transition={{ duration: duration / 1000, ease: "linear" }}
        className={`h-[3px] ${cfg.bar} opacity-50`}
      />
    </motion.div>
  );
}

/**
 * Wrapper tiện dụng – dùng AnimatePresence để toast slide in/out mượt mà.
 * Đặt ở cuối JSX của page:
 *   <ToastContainer toast={toast} onClose={() => setToast(null)} />
 */
export function ToastContainer({
  toast,
  onClose,
}: {
  toast: ToastData | null;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {toast && (
        <Toast
          key={`${toast.type}-${toast.message}`}
          message={toast.message}
          type={toast.type}
          onClose={onClose}
        />
      )}
    </AnimatePresence>
  );
}
