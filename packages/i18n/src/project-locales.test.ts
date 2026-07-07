import { describe, expect, it } from "vitest";
import { projectLocales, projectNamespacesLocales } from "./project-locales.js";

describe("projectLocales", () => {
  const dictionary = {
    login_button: { en: "Login", it: "Accedi" },
    welcome: { en: "Welcome {name}!", it: "Benvenuto {name}!" },
    empty_label: { en: "" },
  };

  const fallback = {
    en: null,
    "de-DE": "en",
    "de-CH": "de-DE",
    it: "en",
  } as const;

  it("keeps only the requested locales with direct templates", () => {
    expect(projectLocales(dictionary, ["en", "it"])).toEqual({
      login_button: { en: "Login", it: "Accedi" },
      welcome: { en: "Welcome {name}!", it: "Benvenuto {name}!" },
      empty_label: { en: "" },
    });
  });

  it("drops locales not listed in the projection", () => {
    expect(projectLocales(dictionary, ["en"])).toEqual({
      login_button: { en: "Login" },
      welcome: { en: "Welcome {name}!" },
      empty_label: { en: "" },
    });
  });

  it("resolves fallback templates for missing direct locale entries", () => {
    expect(projectLocales(dictionary, ["de-CH"], fallback)).toEqual({
      login_button: { "de-CH": "Login" },
      welcome: { "de-CH": "Welcome {name}!" },
      empty_label: { "de-CH": "" },
    });
  });

  it("projects multiple locales with mixed direct and fallback resolution", () => {
    expect(projectLocales(dictionary, ["it", "de-CH"], fallback)).toEqual({
      login_button: { it: "Accedi", "de-CH": "Login" },
      welcome: { it: "Benvenuto {name}!", "de-CH": "Welcome {name}!" },
      empty_label: { it: "", "de-CH": "" },
    });
  });

  it("omits a target locale when fallback cannot resolve a template", () => {
    const partial = {
      login_button: { it: "Accedi" },
    };

    expect(projectLocales(partial, ["en", "it"], fallback)).toEqual({
      login_button: { it: "Accedi" },
    });
  });

  it("deduplicates locales in the projection list", () => {
    expect(projectLocales(dictionary, ["en", "en"])).toEqual({
      login_button: { en: "Login" },
      welcome: { en: "Welcome {name}!" },
      empty_label: { en: "" },
    });
  });
});

describe("projectNamespacesLocales", () => {
  it("projects each namespace independently", () => {
    const dictionary = {
      default: {
        login_button: { en: "Login", it: "Accedi" },
      },
      billing: {
        invoice_summary: { en: "{count} invoices", it: "{count} fatture" },
      },
    };

    expect(projectNamespacesLocales(dictionary, ["en"])).toEqual({
      default: { login_button: { en: "Login" } },
      billing: { invoice_summary: { en: "{count} invoices" } },
    });
  });
});
