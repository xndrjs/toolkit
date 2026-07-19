"use client";

import { useEffect, useRef, useState } from "react";
import { I18n, withI18n } from "../../programmatic/i18n/generated/react-bindings.generated";
import type { ProgrammaticDemoLocale } from "../../programmatic/i18n/generated/i18n-types.generated";

type HeroProps = {
  name: string;
  highlight?: boolean;
};

const Hero = withI18n<HeroProps, HTMLParagraphElement>(
  { namespaces: ["default"] },
  function Hero({ name, highlight = false }, { t, locale }, ref) {
    return (
      <p ref={ref} style={highlight ? { fontWeight: 600 } : undefined}>
        {t("default", "welcome", { name })}{" "}
        <code>
          withI18n · name=&quot;{name}&quot; · locale &quot;{locale}&quot;
        </code>
      </p>
    );
  }
);

export function ProgrammaticClientDemo({ locale }: { locale: ProgrammaticDemoLocale }) {
  const heroRef = useRef<HTMLParagraphElement>(null);
  const [tag, setTag] = useState<string>("…");

  useEffect(() => {
    setTag(heroRef.current?.tagName ?? "(null)");
  }, [locale]);

  return (
    <>
      <Hero ref={heroRef} name="Client" highlight />
      <p>
        <code>heroRef → &lt;{tag}&gt;</code>
      </p>
      <I18n namespaces={["cms"]} fallback={<p className="loading">Loading…</p>}>
        {({ t }) => <p>{t("cms", "footer_note")}</p>}
      </I18n>
    </>
  );
}
