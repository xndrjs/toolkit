import type { Metadata } from "next";
import { SiteNav } from "./_components/site-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "@xndrjs/i18n Demo",
  description: "Next.js demo for @xndrjs/i18n and @xndrjs/i18n-react",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteNav>{children}</SiteNav>
      </body>
    </html>
  );
}
