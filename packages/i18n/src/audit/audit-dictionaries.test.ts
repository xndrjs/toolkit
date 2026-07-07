import { describe, expect, it } from "vitest";
import { auditDictionaries, reportHasGaps } from "./audit-dictionaries.js";

describe("auditDictionaries", () => {
  it("reports missingDirect for fallback-only locales while missingEffective stays empty when en covers", () => {
    const report = auditDictionaries({
      namespaces: {
        default: {
          login_button: { en: "Login", it: "Accedi" },
        },
      },
      config: {
        localeFallback: {
          en: null,
          "de-DE": "en",
          "de-CH": "de-DE",
          it: "en",
        },
      },
    });

    expect(report.requiredLocales).toEqual(["de-CH", "de-DE", "en", "it"]);
    expect(report.missingDirectByLocale.default?.["de-CH"]).toEqual(["login_button"]);
    expect(report.missingEffectiveByLocale.default?.["de-CH"]).toEqual([]);
    expect(report.missingDirectByLocale.default?.en).toEqual([]);
  });

  it("treats empty strings as missing by default", () => {
    const report = auditDictionaries({
      namespaces: {
        default: {
          empty_label: { en: "" },
        },
      },
      config: {},
    });

    expect(report.missingDirectByLocale.default?.en).toEqual(["empty_label"]);
    expect(report.missingEffectiveByLocale.default?.en).toEqual(["empty_label"]);
  });

  it("allows empty strings when treatEmptyAsMissing is false", () => {
    const report = auditDictionaries({
      namespaces: {
        default: {
          empty_label: { en: "" },
        },
      },
      config: {},
      treatEmptyAsMissing: false,
    });

    expect(report.missingDirectByLocale.default?.en).toEqual([]);
    expect(report.missingEffectiveByLocale.default?.en).toEqual([]);
  });

  it("uses enriched locale fallback for effective gaps", () => {
    const report = auditDictionaries({
      namespaces: {
        default: {
          welcome: { en: "Welcome {name}!" },
        },
      },
      config: {
        localeFallback: {
          en: null,
          it: "en",
        },
      },
    });

    expect(report.localeFallback).toEqual({
      en: null,
      it: "en",
    });
    expect(report.missingEffectiveByLocale.default?.it).toEqual([]);
  });

  it("matches direct and effective when localeFallback is absent", () => {
    const report = auditDictionaries({
      namespaces: {
        default: {
          login_button: { en: "Login" },
        },
      },
      config: {},
    });

    expect(report.localeFallback).toBeUndefined();
    expect(report.requiredLocales).toEqual(["en"]);
    expect(report.missingDirectByLocale.default?.en).toEqual([]);
    expect(report.missingEffectiveByLocale.default?.en).toEqual([]);
  });

  it("reports effective gaps when fallback chain cannot resolve", () => {
    const report = auditDictionaries({
      namespaces: {
        default: {
          login_button: { it: "Accedi" },
        },
      },
      config: {
        localeFallback: {
          en: null,
          it: "en",
        },
      },
    });

    expect(report.missingEffectiveByLocale.default?.en).toEqual(["login_button"]);
  });
});

describe("reportHasGaps", () => {
  const report = auditDictionaries({
    namespaces: {
      default: {
        login_button: { en: "Login", it: "Accedi" },
      },
    },
    config: {
      localeFallback: {
        en: null,
        "de-CH": "en",
      },
    },
  });

  it("detects direct gaps", () => {
    expect(reportHasGaps(report, "direct")).toBe(true);
    expect(reportHasGaps(report, "effective")).toBe(false);
    expect(reportHasGaps(report, "any")).toBe(true);
  });
});
