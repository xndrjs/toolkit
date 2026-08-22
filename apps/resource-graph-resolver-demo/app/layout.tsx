import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Resource graph resolver demo",
  description: "Next.js demo for @xndrjs/resource-graph-resolver",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
