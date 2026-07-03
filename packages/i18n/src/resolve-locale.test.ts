import { describe, expect, it } from "vitest";
import {
  formatLocaleFallbackChain,
  resolveLocaleTemplate,
  validateLocaleFallback,
} from "./resolve-locale.js";

const fallbackMap = {
  en: null,
  "de-DE": "en",
  "de-CH": "de-DE",
  it: "en",
} as const;

const localeByKey = {
  en: "Hello",
  it: "Ciao",
};

describe("resolveLocaleTemplate", () => {
  it("returns the template for the requested locale when present", () => {
    expect(resolveLocaleTemplate(localeByKey, "en")).toEqual({
      template: "Hello",
      resolvedLocale: "en",
      fallbackChain: ["en"],
    });
  });

  it("follows the fallback chain until a template is found", () => {
    expect(resolveLocaleTemplate(localeByKey, "de-CH", fallbackMap)).toEqual({
      template: "Hello",
      resolvedLocale: "en",
      fallbackChain: ["de-CH", "de-DE", "en"],
    });
  });

  it("uses an intermediate locale when it has a template", () => {
    const withGerman = { ...localeByKey, "de-DE": "Hallo" };
    expect(resolveLocaleTemplate(withGerman, "de-CH", fallbackMap)).toEqual({
      template: "Hallo",
      resolvedLocale: "de-DE",
      fallbackChain: ["de-CH", "de-DE"],
    });
  });

  it("treats an empty string template as present", () => {
    expect(resolveLocaleTemplate({ en: "" }, "en")).toEqual({
      template: "",
      resolvedLocale: "en",
      fallbackChain: ["en"],
    });
  });

  it("returns undefined when the chain ends with null fallback", () => {
    expect(resolveLocaleTemplate(localeByKey, "de-CH", { "de-CH": null })).toBeUndefined();
  });

  it("returns undefined when the locale is unknown and has no fallback map entry", () => {
    expect(resolveLocaleTemplate(localeByKey, "fr", fallbackMap)).toBeUndefined();
  });

  it("throws on circular fallback chains", () => {
    expect(() =>
      resolveLocaleTemplate(localeByKey, "de-CH", {
        "de-CH": "de-DE",
        "de-DE": "de-CH",
      })
    ).toThrow("[i18n] Circular locale fallback detected");
  });
});

describe("validateLocaleFallback", () => {
  it("accepts acyclic fallback maps", () => {
    expect(() => validateLocaleFallback(fallbackMap)).not.toThrow();
  });

  it("rejects circular fallback maps at construction time", () => {
    expect(() =>
      validateLocaleFallback({
        a: "b",
        b: "a",
      })
    ).toThrow("[i18n] Circular locale fallback detected");
  });
});

describe("formatLocaleFallbackChain", () => {
  it("formats the fallback chain for error messages", () => {
    expect(formatLocaleFallbackChain("de-CH", fallbackMap)).toBe("de-CH → de-DE → en");
  });
});
