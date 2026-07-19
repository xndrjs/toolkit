"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const links = [
  { href: "/", label: "Home" },
  { href: "/multi", label: "Multi" },
  { href: "/areas", label: "Areas" },
  { href: "/programmatic", label: "Programmatic" },
] as const;

export function SiteNav({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <nav className="nav" aria-label="Demo navigation">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={pathname === link.href ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      {children}
    </>
  );
}
