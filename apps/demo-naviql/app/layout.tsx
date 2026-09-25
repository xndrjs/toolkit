import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "NaviQL demo",
  description: "Next.js vertical-slice demo for @xndrjs/naviql",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
