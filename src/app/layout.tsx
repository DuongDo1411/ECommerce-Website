import type { Metadata } from "next";

import "./globals.css";
import Provider from "@/Provider";
import StoreProvider from "@/redux/StoreProvider";

export const metadata: Metadata = {
  title: "multicart",
  description: "Multi-Vendor E-commerce Website",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Provider>
          <StoreProvider>{children}</StoreProvider>
        </Provider>
      </body>
    </html>
  );
}
