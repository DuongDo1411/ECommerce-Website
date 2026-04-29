"use client";
import { div } from "motion/react-client";
import { SessionProvider } from "next-auth/react";
import React from "react";
import { store } from "./store";
import { Provider } from "react-redux";
function StoreProvider({ children }: { children: React.ReactNode }) {
  return <Provider store={store}>{children}</Provider>;
}
export default StoreProvider;
