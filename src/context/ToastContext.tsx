"use client";

import {
  ToastContainer,
  ToastData,
  ToastType,
} from "@/app/component/Toast";
import React, { createContext, useCallback, useContext, useState } from "react";

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    setToast({ message, type });
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toast={toast} onClose={() => setToast(null)} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
