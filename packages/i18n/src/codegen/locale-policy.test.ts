import { describe, expect, it } from "vitest";
import { buildRequiredLocales, enrichLocaleFallback } from "./locale-policy.js";

describe("locale-policy", () => {
  it("buildRequiredLocales unions dictionary locales with fallback keys and targets", () => {
    const locales = new Set(["en", "it"]);
    const fallback = { en: null, "de-CH": "de-DE", "de-DE": "en", it: "en" };

    expect(buildRequiredLocales(locales, fallback)).toEqual(["de-CH", "de-DE", "en", "it"]);
    expect(buildRequiredLocales(locales)).toEqual(["en", "it"]);
  });

  it("enrichLocaleFallback adds null for required locales missing from config", () => {
    const locales = new Set(["en", "fr"]);
    const fallback = { en: null, it: "en" };

    expect(enrichLocaleFallback(locales, fallback)).toEqual({
      en: null,
      fr: null,
      it: "en",
    });
  });

  it("enrichLocaleFallback is a no-op when all required locales are already configured", () => {
    const locales = new Set(["en", "it"]);
    const fallback = {
      en: null,
      "de-DE": "en",
      "de-CH": "de-DE",
      it: "en",
    };

    expect(enrichLocaleFallback(locales, fallback)).toEqual(fallback);
  });
});
