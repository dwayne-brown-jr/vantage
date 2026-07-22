import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { ToastProvider } from "@/components/Toast";

import "./globals.css";

export const metadata: Metadata = {
  title: "Vantage — Personal portfolio desk",
  description: "A single-user portfolio tracker, planner, and AI strategist. Local-first and private.",
};

export const viewport: Viewport = {
  themeColor: "#151a23",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
