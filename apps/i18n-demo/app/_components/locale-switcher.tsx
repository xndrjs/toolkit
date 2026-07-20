"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function LocaleSwitcher<L extends string>({
  locales,
  current,
}: {
  locales: readonly L[];
  current: L;
}) {
  const pathname = usePathname();

  return (
    <nav className="locale-switcher" aria-label="Locale">
      {locales.map((locale) => (
        <Link
          key={locale}
          href={`${pathname}?locale=${encodeURIComponent(locale)}`}
          className="locale-switcher__link"
          aria-current={locale === current ? "true" : undefined}
        >
          {locale}
        </Link>
      ))}
    </nav>
  );
}
