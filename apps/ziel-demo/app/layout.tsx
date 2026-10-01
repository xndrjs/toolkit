import type { Metadata } from "next";
import Link from "next/link";

import { DEMO_PRODUCT_ID } from "../src/infrastructure/fixtures/commerce-store";
import { DEFAULT_ERROR_HANDLING_CASE_ID } from "../src/orchestration/resolve-error-handling";

import "./globals.css";

export const metadata: Metadata = {
  title: "Ziel demo",
  description: "Next.js vertical-slice demo for @xndrjs/ziel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <nav className="site-nav" aria-label="Demo verticals">
            <Link href="/en-US">Page detail</Link>
            <Link href={`/error-handling/${DEFAULT_ERROR_HANDLING_CASE_ID}`}>Error handling</Link>
            <Link href={`/products/${DEMO_PRODUCT_ID}`}>Product detail</Link>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
