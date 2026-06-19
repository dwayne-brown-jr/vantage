import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Vantage — Personal portfolio desk",
  description: "A single-user portfolio tracker, planner, and AI strategist. Local-first and private.",
};

export const viewport: Viewport = {
  themeColor: "#0e1116",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
