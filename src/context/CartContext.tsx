"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

interface CartContextType {
  cartCount: number;
  refreshCart: () => Promise<void>;
}

const CartContext = createContext<CartContextType>({
  cartCount: 0,
  refreshCart: async () => {},
});

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cartCount, setCartCount] = useState(0);

  const refreshCart = useCallback(async () => {
    try {
      const res = await fetch("/api/user/cart");
      if (!res.ok) return;
      const data = await res.json();
      // Tính tổng số lượng (sum quantity của từng item)
      const total = (data.cart ?? []).reduce(
        (sum: number, item: any) => sum + (item.quantity ?? 1),
        0,
      );
      setCartCount(total);
    } catch {
      // Nếu chưa đăng nhập hoặc lỗi — giữ count = 0
    }
  }, []);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  return (
    <CartContext.Provider value={{ cartCount, refreshCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
