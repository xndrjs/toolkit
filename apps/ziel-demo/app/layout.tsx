import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Ziel demo",
  description: "Next.js vertical-slice demo for @xndrjs/ziel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
