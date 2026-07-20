import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { createI18nHandle } from "./builder.js";
import { IcuTranslationProviderMulti } from "./IcuTranslationProviderMulti.js";

type MultiSchema = {
  default: {
    login_button: { en: string; it: string };
    welcome: { en: string };
  };
  billing: {
    invoice_summary: { en: string; it: string };
  };
};

type TestMultiParams = {
  default: {
    login_button: never;
    welcome: { name: string };
  };
  billing: {
    invoice_summary: { count: number; name: string };
  };
};

const billingIt = {
  invoice_summary: {
    it: "Hai {count, plural, one {1 fattura} other {{count} fatture}} per {name}",
  },
};

const billingEn = {
  invoice_summary: {
    en: "You have {count, plural, one {1 invoice} other {{count} invoices}} for {name}",
  },
};

const defaultIt = {
  login_button: { it: "Accedi" },
  welcome: { it: "Benvenuto {name}!" },
};

describe("I18nHandle", () => {
  it("load() invokes mock loaders, merges into the engine, and returns a bound view", async () => {
    const billingLoader = vi.fn(async (locale: string) => {
      return locale === "it" ? billingIt : billingEn;
    });
    const engine = new IcuTranslationProviderMulti<MultiSchema, TestMultiParams>({});
    const handle = createI18nHandle(engine, {
      namespaceLoaders: {
        billing: billingLoader,
      },
    });

    const view = await handle.load({ namespaces: ["billing"], locale: "it" });

    expect(billingLoader).toHaveBeenCalledWith("it", { locale: "it" });
    expect(view.locale).toBe("it");
    expect(view.t("billing", "invoice_summary", { count: 2, name: "Ada" })).toBe(
      "Hai 2 fatture per Ada"
    );
  });

  it("loads multiple namespaces in one call", async () => {
    const billingLoader = vi.fn(async (locale: string) =>
      locale === "it" ? billingIt : billingEn
    );
    const defaultLoader = vi.fn(async () => defaultIt);
    const engine = new IcuTranslationProviderMulti<MultiSchema, TestMultiParams>({});

    const view = await createI18nHandle(engine, {
      namespaceLoaders: {
        billing: billingLoader,
        default: defaultLoader,
      },
    }).load({ namespaces: ["billing", "default"], locale: "it" });

    expect(billingLoader).toHaveBeenCalledWith("it", { locale: "it" });
    expect(defaultLoader).toHaveBeenCalledWith("it", { locale: "it" });
    expect(view.t("default", "login_button")).toBe("Accedi");
    expect(view.t("billing", "invoice_summary", { count: 1, name: "Bob" })).toBe(
      "Hai 1 fattura per Bob"
    );
  });

  it("accumulates engine data across repeated load() calls on the same handle", async () => {
    const billingLoader = vi.fn(async (locale: string) =>
      locale === "it" ? billingIt : billingEn
    );
    const defaultLoader = vi.fn(async () => defaultIt);
    const engine = new IcuTranslationProviderMulti<MultiSchema, TestMultiParams>({});
    const handle = createI18nHandle(engine, {
      namespaceLoaders: {
        billing: billingLoader,
        default: defaultLoader,
      },
    });

    const billingView = await handle.load({ namespaces: ["billing"], locale: "it" });
    const defaultView = await handle.load({ namespaces: ["default"], locale: "it" });

    expect(billingLoader).toHaveBeenCalledTimes(1);
    expect(defaultLoader).toHaveBeenCalledTimes(1);
    expect(billingView.t("billing", "invoice_summary", { count: 1, name: "Ada" })).toBe(
      "Hai 1 fattura per Ada"
    );
    expect(defaultView.t("default", "login_button")).toBe("Accedi");
    expect(engine.getAll().billing?.invoice_summary?.it).toBe(billingIt.invoice_summary.it);
    expect(engine.getAll().default?.login_button?.it).toBe("Accedi");
  });

  it("returns a view scoped to namespaces declared at load time", async () => {
    const billingLoader = vi.fn(async (locale: string) =>
      locale === "it" ? billingIt : billingEn
    );
    const defaultLoader = vi.fn(async () => defaultIt);
    const engine = new IcuTranslationProviderMulti<MultiSchema, TestMultiParams>({});
    const handle = createI18nHandle(engine, {
      namespaceLoaders: {
        billing: billingLoader,
        default: defaultLoader,
      },
    });

    const billingView = await handle.load({ namespaces: ["billing"], locale: "it" });
    await handle.load({ namespaces: ["default"], locale: "it" });

    expect(billingView.t("billing", "invoice_summary", { count: 1, name: "Ada" })).toBe(
      "Hai 1 fattura per Ada"
    );
    // billingView is typed for the billing namespace only; default is excluded at compile time.
  });

  it("maps locale to delivery partition via partitionForLocale", async () => {
    const billingLoader = vi.fn(async (area: string) => {
      return area === "eu" ? billingIt : billingEn;
    });
    const engine = new IcuTranslationProviderMulti<MultiSchema, TestMultiParams>({});

    const view = await createI18nHandle(engine, {
      namespaceLoaders: {
        billing: billingLoader,
      },
      partitionForLocale: (locale) => (locale === "it" ? "eu" : "us"),
    }).load({ namespaces: ["billing"], locale: "it" });

    expect(billingLoader).toHaveBeenCalledWith("eu", { locale: "it" });
    expect(view.locale).toBe("it");
    expect(view.t("billing", "invoice_summary", { count: 2, name: "Ada" })).toBe(
      "Hai 2 fatture per Ada"
    );
    expectTypeOf(view.t).toBeCallableWith("billing", "invoice_summary", {
      count: 2,
      name: "Ada",
    });
  });

  it("loads partitioned namespace loaders with locale", async () => {
    const billingLoader = vi.fn(async (locale: string) =>
      locale === "it"
        ? {
            invoice_summary: {
              it: "Hai {count, plural, one {1 fattura} other {{count} fatture}} per {name}",
            },
          }
        : {
            invoice_summary: {
              en: "You have {count, plural, one {1 invoice} other {{count} invoices}} for {name}",
            },
          }
    );
    const engine = new IcuTranslationProviderMulti<MultiSchema, TestMultiParams>({});

    const view = await createI18nHandle(engine, {
      namespaceLoaders: {
        billing: billingLoader,
      },
    }).load({ namespaces: ["billing"], locale: "en" });

    expect(billingLoader).toHaveBeenCalledTimes(1);
    expect(billingLoader.mock.calls[0]).toEqual(["en", { locale: "en" }]);
    expect(view.t("billing", "invoice_summary", { count: 1, name: "Ada" })).toBe(
      "You have 1 invoice for Ada"
    );
  });

  it("rejects an empty namespaces array", async () => {
    const billingLoader = vi.fn(async () => billingEn);
    const engine = new IcuTranslationProviderMulti<MultiSchema, TestMultiParams>({});
    const handle = createI18nHandle(engine, {
      namespaceLoaders: {
        billing: billingLoader,
      },
    });

    await expect(
      handle.load({ namespaces: [] as unknown as ["billing"], locale: "en" })
    ).rejects.toThrow("load() requires a non-empty namespaces array");
  });

  it("skips a repeated load for the same namespace partition", async () => {
    const billingLoader = vi.fn(async (locale: string) =>
      locale === "it" ? billingIt : billingEn
    );
    const engine = new IcuTranslationProviderMulti<MultiSchema, TestMultiParams>({});
    const handle = createI18nHandle(engine, {
      namespaceLoaders: { billing: billingLoader },
    });

    await handle.load({ namespaces: ["billing"], locale: "it" });
    await handle.load({ namespaces: ["billing"], locale: "it" });

    expect(billingLoader).toHaveBeenCalledTimes(1);
  });

  it("returns a destructuring-safe locale-bound scope from load()", async () => {
    const billingLoader = vi.fn(async () => billingEn);
    const engine = new IcuTranslationProviderMulti<MultiSchema, TestMultiParams>({});
    const { t } = await createI18nHandle(engine, {
      namespaceLoaders: { billing: billingLoader },
    }).load({ namespaces: ["billing"], locale: "en" });

    expect(t("billing", "invoice_summary", { count: 1, name: "Ada" })).toBe(
      "You have 1 invoice for Ada"
    );
  });

  it("still loads a different partition for the same namespace", async () => {
    const billingLoader = vi.fn(async (locale: string) =>
      locale === "it" ? billingIt : billingEn
    );
    const engine = new IcuTranslationProviderMulti<MultiSchema, TestMultiParams>({});
    const handle = createI18nHandle(engine, {
      namespaceLoaders: { billing: billingLoader },
    });

    await handle.load({ namespaces: ["billing"], locale: "it" });
    await handle.load({ namespaces: ["billing"], locale: "en" });

    expect(billingLoader).toHaveBeenCalledTimes(2);
    expect(billingLoader).toHaveBeenNthCalledWith(1, "it", { locale: "it" });
    expect(billingLoader).toHaveBeenNthCalledWith(2, "en", { locale: "en" });
  });

  it("peek() returns null until resources are loaded, then a sync scope", async () => {
    const billingLoader = vi.fn(async () => billingEn);
    const engine = new IcuTranslationProviderMulti<MultiSchema, TestMultiParams>({});
    const handle = createI18nHandle(engine, {
      namespaceLoaders: { billing: billingLoader },
    });

    expect(handle.peek({ namespaces: ["billing"], locale: "en" })).toBeNull();

    await handle.load({ namespaces: ["billing"], locale: "en" });
    const sync = handle.peek({ namespaces: ["billing"], locale: "en" });
    expect(sync).not.toBeNull();
    expect(sync!.t("billing", "invoice_summary", { count: 1, name: "Ada" })).toBe(
      "You have 1 invoice for Ada"
    );
  });
});
