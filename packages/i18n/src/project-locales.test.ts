import { describe, expect, it } from "vitest";
import {
  mergeDictionaryLocalesCore,
  mergeNamespaceLocalesCore,
  projectDictionaryForDeliveryAreaCore,
  projectDictionaryLocalesCore,
  projectNamespaceForDeliveryAreaCore,
  projectNamespaceLocalesCore,
} from "./project-locales.js";

describe("projectNamespaceLocalesCore", () => {
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
    expect(projectNamespaceLocalesCore(dictionary, ["en", "it"])).toEqual({
      login_button: { en: "Login", it: "Accedi" },
      welcome: { en: "Welcome {name}!", it: "Benvenuto {name}!" },
      empty_label: { en: "" },
    });
  });

  it("drops locales not listed in the projection", () => {
    expect(projectNamespaceLocalesCore(dictionary, ["en"])).toEqual({
      login_button: { en: "Login" },
      welcome: { en: "Welcome {name}!" },
      empty_label: { en: "" },
    });
  });

  it("resolves fallback templates for missing direct locale entries", () => {
    expect(projectNamespaceLocalesCore(dictionary, ["de-CH"], fallback)).toEqual({
      login_button: { "de-CH": "Login" },
      welcome: { "de-CH": "Welcome {name}!" },
      empty_label: { "de-CH": "" },
    });
  });

  it("projects multiple locales with mixed direct and fallback resolution", () => {
    expect(projectNamespaceLocalesCore(dictionary, ["it", "de-CH"], fallback)).toEqual({
      login_button: { it: "Accedi", "de-CH": "Login" },
      welcome: { it: "Benvenuto {name}!", "de-CH": "Welcome {name}!" },
      empty_label: { it: "", "de-CH": "" },
    });
  });

  it("omits a target locale when fallback cannot resolve a template", () => {
    const partial = {
      login_button: { it: "Accedi" },
    };

    expect(projectNamespaceLocalesCore(partial, ["en", "it"], fallback)).toEqual({
      login_button: { it: "Accedi" },
    });
  });

  it("deduplicates locales in the projection list", () => {
    expect(projectNamespaceLocalesCore(dictionary, ["en", "en"])).toEqual({
      login_button: { en: "Login" },
      welcome: { en: "Welcome {name}!" },
      empty_label: { en: "" },
    });
  });
});

describe("projectNamespaceForDeliveryAreaCore", () => {
  const namespace = {
    some_key: { it: "Ciao", "it-CH": "Ciao CH", fr: "Hallo", "en-US": "Hello" },
    some_other_key: { "en-US": "Computer", fr: "Ordinateur" },
  };

  const localeFallback = {
    "en-US": null,
    it: "en-US",
    "it-CH": "it",
    fr: null,
  } as const;

  it("projects eu area with fallback resolution for full locales", () => {
    expect(
      projectNamespaceForDeliveryAreaCore(namespace, ["it", "fr", "it-CH"], localeFallback)
    ).toEqual({
      some_key: { it: "Ciao", fr: "Hallo", "it-CH": "Ciao CH" },
      // it-CH is preserve (fallback it is in the area): copied only when present in the
      // canonical dict; "it" is full (fallback en-US is outside the area) and resolves here.
      some_other_key: { it: "Computer", fr: "Ordinateur" },
    });
  });

  it("projects us area with single full locale", () => {
    expect(projectNamespaceForDeliveryAreaCore(namespace, ["en-US"], localeFallback)).toEqual({
      some_key: { "en-US": "Hello" },
      some_other_key: { "en-US": "Computer" },
    });
  });

  it("preserves canonical entries for in-area fallback locales without resolving", () => {
    const withInAreaFallback = {
      some_key: { it: "Ciao", "it-CH": "Ciao CH", fr: "Hallo", "en-US": "Hello" },
      some_other_key: {
        it: "Italiano",
        "it-CH": "Svizzero",
        "en-US": "Computer",
        fr: "Ordinateur",
      },
    };

    expect(
      projectNamespaceForDeliveryAreaCore(
        withInAreaFallback,
        ["it", "it-CH", "en-US", "fr"],
        localeFallback
      )
    ).toEqual({
      some_key: { it: "Ciao", "it-CH": "Ciao CH", "en-US": "Hello", fr: "Hallo" },
      some_other_key: {
        it: "Italiano",
        "it-CH": "Svizzero",
        "en-US": "Computer",
        fr: "Ordinateur",
      },
    });
  });
});

describe("projectDictionaryForDeliveryAreaCore", () => {
  const localeFallback = {
    "en-US": null,
    it: "en-US",
    "it-CH": "it",
    fr: null,
  } as const;

  it("projects each namespace independently for a multi-namespace dictionary", () => {
    const dictionary = {
      default: {
        some_key: { it: "Ciao", "it-CH": "Ciao CH", fr: "Hallo", "en-US": "Hello" },
        some_other_key: { "en-US": "Computer", fr: "Ordinateur" },
      },
      billing: {
        invoice_summary: {
          it: "{count} fatture",
          "en-US": "{count} invoices",
          fr: "{count} factures",
        },
      },
    };

    expect(
      projectDictionaryForDeliveryAreaCore(dictionary, ["it", "fr", "it-CH"], localeFallback)
    ).toEqual({
      default: {
        some_key: { it: "Ciao", fr: "Hallo", "it-CH": "Ciao CH" },
        some_other_key: { it: "Computer", fr: "Ordinateur" },
      },
      billing: {
        invoice_summary: { it: "{count} fatture", fr: "{count} factures" },
      },
    });
  });

  it("matches projectNamespaceForDeliveryAreaCore applied per namespace", () => {
    const dictionary = {
      default: {
        some_key: { it: "Ciao", "en-US": "Hello" },
      },
      billing: {
        invoice_summary: { it: "{count} fatture", "en-US": "{count} invoices" },
      },
    };
    const areaLocales = ["en-US"] as const;

    expect(projectDictionaryForDeliveryAreaCore(dictionary, areaLocales, localeFallback)).toEqual({
      default: projectNamespaceForDeliveryAreaCore(dictionary.default, areaLocales, localeFallback),
      billing: projectNamespaceForDeliveryAreaCore(dictionary.billing, areaLocales, localeFallback),
    });
  });
});

describe("projectDictionaryLocalesCore", () => {
  it("projects each namespace independently", () => {
    const dictionary = {
      default: {
        login_button: { en: "Login", it: "Accedi" },
      },
      billing: {
        invoice_summary: { en: "{count} invoices", it: "{count} fatture" },
      },
    };

    expect(projectDictionaryLocalesCore(dictionary, ["en"])).toEqual({
      default: { login_button: { en: "Login" } },
      billing: { invoice_summary: { en: "{count} invoices" } },
    });
  });
});

describe("mergeNamespaceLocalesCore", () => {
  type TestDictionary = {
    welcome: Partial<Record<"en" | "it", string>>;
    login_button: Partial<Record<"en" | "it", string>>;
  };

  it("merges locale maps per key without dropping existing locales", () => {
    const existing: TestDictionary = {
      welcome: { en: "Welcome {name}!" },
      login_button: { en: "Login", it: "Accedi" },
    };
    const incoming = {
      welcome: { it: "Benvenuto {name}!" },
    };

    expect(mergeNamespaceLocalesCore(existing, incoming)).toEqual({
      welcome: { en: "Welcome {name}!", it: "Benvenuto {name}!" },
      login_button: { en: "Login", it: "Accedi" },
    });
  });

  it("overwrites the same locale when incoming provides a new template", () => {
    const existing = {
      welcome: { en: "Welcome {name}!" },
    };
    const incoming = {
      welcome: { en: "Hello {name}!" },
    };

    expect(mergeNamespaceLocalesCore(existing, incoming)).toEqual({
      welcome: { en: "Hello {name}!" },
    });
  });
});

describe("mergeDictionaryLocalesCore", () => {
  type TestMultiDictionary = {
    default: {
      welcome: Partial<Record<"en" | "it", string>>;
    };
    billing: {
      invoice_summary: Partial<Record<"en" | "it", string>>;
    };
  };

  it("merges each namespace without dropping existing locales", () => {
    const existing: TestMultiDictionary = {
      default: {
        welcome: { en: "Welcome {name}!" },
      },
      billing: {
        invoice_summary: { en: "{count} invoices" },
      },
    };
    const incoming = {
      default: {
        welcome: { it: "Benvenuto {name}!" },
      },
      billing: {
        invoice_summary: { it: "{count} fatture" },
      },
    };

    expect(mergeDictionaryLocalesCore(existing, incoming)).toEqual({
      default: {
        welcome: { en: "Welcome {name}!", it: "Benvenuto {name}!" },
      },
      billing: {
        invoice_summary: { en: "{count} invoices", it: "{count} fatture" },
      },
    });
  });
});
