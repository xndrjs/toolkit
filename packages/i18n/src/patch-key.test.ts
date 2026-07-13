import { describe, expect, it } from "vitest";
import {
  assertPatchKeyMulti,
  assertPatchKeySingle,
  preloadKeyMulti,
  preloadKeySingle,
  recordPreloadedKeysMulti,
  recordPreloadedKeysSingle,
  seedPreloadedKeysMulti,
  seedPreloadedKeysSingle,
} from "./patch-key.js";

describe("preload key helpers", () => {
  it("formats single preload keys as key:locale", () => {
    expect(preloadKeySingle("welcome", "en")).toBe("welcome:en");
  });

  it("formats multi preload keys as namespace:key:locale", () => {
    expect(preloadKeyMulti("billing", "invoice_summary", "it")).toBe("billing:invoice_summary:it");
  });
});

describe("seedPreloadedKeysSingle", () => {
  it("seeds every key/locale pair from the initial dictionary", () => {
    const preloadedKeys = new Set<string>();
    seedPreloadedKeysSingle(
      {
        login_button: { en: "Login", it: "Accedi" },
        welcome: { en: "Welcome {name}!" },
      },
      preloadedKeys
    );

    expect(preloadedKeys).toEqual(new Set(["login_button:en", "login_button:it", "welcome:en"]));
  });
});

describe("seedPreloadedKeysMulti", () => {
  it("seeds every namespace/key/locale triple from the initial dictionary", () => {
    const preloadedKeys = new Set<string>();
    seedPreloadedKeysMulti(
      {
        default: { login_button: { en: "Login" } },
        billing: { invoice_summary: { en: "One", it: "Uno" } },
      },
      preloadedKeys
    );

    expect(preloadedKeys).toEqual(
      new Set([
        "default:login_button:en",
        "billing:invoice_summary:en",
        "billing:invoice_summary:it",
      ])
    );
  });
});

describe("recordPreloadedKeysSingle", () => {
  it("records locales from a load merge payload", () => {
    const preloadedKeys = new Set<string>();
    recordPreloadedKeysSingle(
      {
        welcome: { it: "Benvenuto {name}!" },
      },
      preloadedKeys
    );

    expect(preloadedKeys).toEqual(new Set(["welcome:it"]));
  });
});

describe("recordPreloadedKeysMulti", () => {
  it("records locales from a namespace load merge payload", () => {
    const preloadedKeys = new Set<string>();
    recordPreloadedKeysMulti(
      "billing",
      {
        invoice_summary: { it: "Hai {count} fatture" },
      },
      preloadedKeys
    );

    expect(preloadedKeys).toEqual(new Set(["billing:invoice_summary:it"]));
  });
});

describe("assertPatchKeySingle", () => {
  const preloadedKeys = new Set(["welcome:en", "welcome:it", "invoice_count:en"]);

  it("accepts a valid patch for a preloaded key", () => {
    expect(() =>
      assertPatchKeySingle("welcome", "en", "Hello {name}!", preloadedKeys, {
        en: "Welcome {name}!",
        it: "Benvenuto {name}!",
      })
    ).not.toThrow();
  });

  it("rejects a key that was not preloaded", () => {
    expect(() =>
      assertPatchKeySingle("welcome", "fr", "Bonjour {name}!", preloadedKeys, {
        en: "Welcome {name}!",
      })
    ).toThrow("[i18n] Key not preloaded: welcome (fr)");
  });

  it("rejects invalid ICU syntax", () => {
    expect(() =>
      assertPatchKeySingle("welcome", "en", "Hi {name", preloadedKeys, {
        en: "Welcome {name}!",
      })
    ).toThrow("[i18n] ICU syntax error on patch:");
  });

  it("rejects incompatible ICU args against other locales for the same key", () => {
    expect(() =>
      assertPatchKeySingle(
        "invoice_count",
        "en",
        "{count, select, other {{count}}}",
        preloadedKeys,
        {
          en: "You have {count, plural, one {1 invoice} other {{count} invoices}}",
          it: "Hai {count, plural, one {1 fattura} other {{count} fatture}}",
        }
      )
    ).toThrow("[i18n] ICU args mismatch on patch:");
  });
});

describe("assertPatchKeyMulti", () => {
  const preloadedKeys = new Set([
    "billing:invoice_summary:en",
    "billing:invoice_summary:it",
    "default:login_button:en",
  ]);

  it("accepts a valid patch for a preloaded namespace key", () => {
    expect(() =>
      assertPatchKeyMulti(
        "billing",
        "invoice_summary",
        "en",
        "You have {count, plural, one {1 bill} other {{count} bills}} for {name}",
        preloadedKeys,
        {
          en: "You have {count, plural, one {1 invoice} other {{count} invoices}} for {name}",
          it: "Hai {count, plural, one {1 fattura} other {{count} fatture}} per {name}",
        }
      )
    ).not.toThrow();
  });

  it("rejects a namespace key that was not preloaded", () => {
    expect(() =>
      assertPatchKeyMulti("billing", "invoice_summary", "fr", "Facture {count}", preloadedKeys, {
        en: "You have {count} invoices",
      })
    ).toThrow("[i18n] Key not preloaded: billing.invoice_summary (fr)");
  });

  it("rejects invalid ICU syntax", () => {
    expect(() =>
      assertPatchKeyMulti("default", "login_button", "en", "Sign {in", preloadedKeys, {
        en: "Login",
      })
    ).toThrow("[i18n] ICU syntax error on patch:");
  });

  it("rejects incompatible ICU args against other locales for the same key", () => {
    expect(() =>
      assertPatchKeyMulti(
        "billing",
        "invoice_summary",
        "en",
        "{count, select, other {{count}}}",
        preloadedKeys,
        {
          en: "You have {count, plural, one {1 invoice} other {{count} invoices}} for {name}",
          it: "Hai {count, plural, one {1 fattura} other {{count} fatture}} per {name}",
        }
      )
    ).toThrow("[i18n] ICU args mismatch on patch:");
  });
});
