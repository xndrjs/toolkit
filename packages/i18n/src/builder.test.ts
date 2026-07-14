import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { createI18nBuilder, createI18nMultiBuilder } from "./builder.js";
import { IcuTranslationProviderMulti } from "./IcuTranslationProviderMulti.js";
import { IcuTranslationProviderSingle } from "./IcuTranslationProviderSingle.js";

type SingleSchema = {
  login_button: { en: string; it: string };
  welcome: { en: string; it: string };
};

type SingleParams = {
  login_button: never;
  welcome: { name: string };
};

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

type TestDeliveryArea = "eu" | "us";
type TestDeliveryArtifacts = {
  eu: readonly ["it"];
  us: readonly ["en"];
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

describe("I18nBuilder multi", () => {
  it("load() invokes mock loaders, merges into the engine, and returns a bound view", async () => {
    const billingLoader = vi.fn(async (locale: string) => {
      return locale === "it" ? billingIt : billingEn;
    });
    const engine = new IcuTranslationProviderMulti<MultiSchema, TestMultiParams>({});
    const builder = createI18nBuilder(engine, {
      namespaceLoaders: {
        billing: billingLoader,
      },
    });

    const view = await builder.withNamespaces(["billing"]).withLocale("it").load();

    expect(billingLoader).toHaveBeenCalledWith("it");
    expect(view.locale).toBe("it");
    expect(view.t("billing", "invoice_summary", { count: 2, name: "Ada" })).toBe(
      "Hai 2 fatture per Ada"
    );
  });

  it("chains withNamespaces and withLocale before load()", async () => {
    const billingLoader = vi.fn(async (locale: string) =>
      locale === "it" ? billingIt : billingEn
    );
    const defaultLoader = vi.fn(async () => defaultIt);
    const engine = new IcuTranslationProviderMulti<MultiSchema, TestMultiParams>({});

    const view = await createI18nMultiBuilder(engine, {
      namespaceLoaders: {
        billing: billingLoader,
        default: defaultLoader,
      },
    })
      .withNamespaces(["billing", "default"])
      .withLocale("it")
      .load();

    expect(billingLoader).toHaveBeenCalledWith("it");
    expect(defaultLoader).toHaveBeenCalledWith("it");
    expect(view.t("default", "login_button")).toBe("Accedi");
    expect(view.t("billing", "invoice_summary", { count: 1, name: "Bob" })).toBe(
      "Hai 1 fattura per Bob"
    );
  });

  it("patches a preloaded key via scope.set() after load()", async () => {
    const billingLoader = vi.fn(async () => billingEn);
    const engine = new IcuTranslationProviderMulti<MultiSchema, TestMultiParams>({});

    const view = await createI18nBuilder(engine, {
      namespaceLoaders: { billing: billingLoader },
    })
      .withNamespaces(["billing"])
      .withLocale("en")
      .load();

    view.set(
      "billing",
      "invoice_summary",
      "You have {count, plural, one {1 invoice only} other {{count} invoices only}} for {name}"
    );

    expect(view.t("billing", "invoice_summary", { count: 1, name: "Ada" })).toBe(
      "You have 1 invoice only for Ada"
    );
  });

  it("accumulates engine data across repeated load() calls on the same builder", async () => {
    const billingLoader = vi.fn(async (locale: string) =>
      locale === "it" ? billingIt : billingEn
    );
    const defaultLoader = vi.fn(async () => defaultIt);
    const engine = new IcuTranslationProviderMulti<MultiSchema, TestMultiParams>({});
    const builder = createI18nBuilder(engine, {
      namespaceLoaders: {
        billing: billingLoader,
        default: defaultLoader,
      },
    });

    const billingView = await builder.withNamespaces(["billing"]).withLocale("it").load();
    const defaultView = await builder.withNamespaces(["default"]).withLocale("it").load();

    expect(billingLoader).toHaveBeenCalledTimes(1);
    expect(defaultLoader).toHaveBeenCalledTimes(1);
    expect(billingView.t("billing", "invoice_summary", { count: 1, name: "Ada" })).toBe(
      "Hai 1 fattura per Ada"
    );
    expect(defaultView.t("default", "login_button")).toBe("Accedi");
    expect(engine.getAll().billing.invoice_summary.it).toBe(billingIt.invoice_summary.it);
    expect(engine.getAll().default.login_button.it).toBe("Accedi");
  });

  it("returns a view scoped to namespaces declared at load time", async () => {
    const billingLoader = vi.fn(async (locale: string) =>
      locale === "it" ? billingIt : billingEn
    );
    const defaultLoader = vi.fn(async () => defaultIt);
    const engine = new IcuTranslationProviderMulti<MultiSchema, TestMultiParams>({});
    const builder = createI18nBuilder(engine, {
      namespaceLoaders: {
        billing: billingLoader,
        default: defaultLoader,
      },
    });

    const billingView = await builder.withNamespaces(["billing"]).withLocale("it").load();
    await builder.withNamespaces(["default"]).withLocale("it").load();

    expect(billingView.t("billing", "invoice_summary", { count: 1, name: "Ada" })).toBe(
      "Hai 1 fattura per Ada"
    );
    // billingView is typed for the billing namespace only; default is excluded at compile time.
  });

  it("loads via withDeliveryArea for custom delivery partitions", async () => {
    const billingLoader = vi.fn(async (area: string) => {
      return area === "eu" ? billingIt : billingEn;
    });
    const engine = new IcuTranslationProviderMulti<MultiSchema, TestMultiParams>({});

    const euView = await createI18nMultiBuilder<
      MultiSchema,
      TestMultiParams,
      "en" | "it",
      TestDeliveryArea,
      TestDeliveryArtifacts
    >(engine, {
      namespaceLoaders: {
        billing: billingLoader,
      },
    })
      .withNamespaces(["billing"])
      .withDeliveryArea("eu")
      .load();

    expect(billingLoader).toHaveBeenCalledWith("eu");
    expect(euView.t("billing", "invoice_summary", "it", { count: 2, name: "Ada" })).toBe(
      "Hai 2 fatture per Ada"
    );
    expectTypeOf(euView.t).toBeCallableWith("billing", "invoice_summary", "it", {
      count: 2,
      name: "Ada",
    });
    expectTypeOf(euView.forLocale).toBeCallableWith("it");
    expectTypeOf(euView.forLocale).parameters.not.toMatchTypeOf<["en-US"]>();
  });

  it("loads canonical namespace loaders without a partition", async () => {
    const billingLoader = vi.fn(async () => ({
      invoice_summary: {
        en: "You have {count, plural, one {1 invoice} other {{count} invoices}} for {name}",
        it: "Hai {count, plural, one {1 fattura} other {{count} fatture}} per {name}",
      },
    }));
    const engine = new IcuTranslationProviderMulti<MultiSchema, TestMultiParams>({});

    const view = await createI18nBuilder(engine, {
      namespaceLoaders: {
        billing: billingLoader,
      },
    })
      .withNamespaces(["billing"])
      .load();

    expect(billingLoader).toHaveBeenCalledTimes(1);
    expect(billingLoader.mock.calls[0]).toEqual([]);
    expect(view.t("billing", "invoice_summary", "en", { count: 1, name: "Ada" })).toBe(
      "You have 1 invoice for Ada"
    );
  });

  it("skips a repeated load for the same namespace partition", async () => {
    const billingLoader = vi.fn(async (locale: string) =>
      locale === "it" ? billingIt : billingEn
    );
    const engine = new IcuTranslationProviderMulti<MultiSchema, TestMultiParams>({});
    const options = { namespaceLoaders: { billing: billingLoader } };
    const chain = () =>
      createI18nBuilder(engine, options).withNamespaces(["billing"]).withLocale("it");

    await chain().load();
    await chain().load();

    expect(billingLoader).toHaveBeenCalledTimes(1);
  });

  it("returns a destructuring-safe locale-bound scope from load()", async () => {
    const billingLoader = vi.fn(async () => billingEn);
    const engine = new IcuTranslationProviderMulti<MultiSchema, TestMultiParams>({});
    const { t } = await createI18nBuilder(engine, {
      namespaceLoaders: { billing: billingLoader },
    })
      .withNamespaces(["billing"])
      .withLocale("en")
      .load();

    expect(t("billing", "invoice_summary", { count: 1, name: "Ada" })).toBe(
      "You have 1 invoice for Ada"
    );
  });

  it("preserves runtime patches when a later builder reloads the same resource", async () => {
    const billingLoader = vi.fn(async () => billingEn);
    const engine = new IcuTranslationProviderMulti<MultiSchema, TestMultiParams>({});
    const options = { namespaceLoaders: { billing: billingLoader } };

    const firstView = await createI18nBuilder(engine, options)
      .withNamespaces(["billing"])
      .withLocale("en")
      .load();

    firstView.set(
      "billing",
      "invoice_summary",
      "You have {count, plural, one {1 invoice only} other {{count} invoices only}} for {name}"
    );

    const secondView = await createI18nBuilder(engine, options)
      .withNamespaces(["billing"])
      .withLocale("en")
      .load();

    expect(billingLoader).toHaveBeenCalledTimes(1);
    expect(secondView.t("billing", "invoice_summary", { count: 1, name: "Ada" })).toBe(
      "You have 1 invoice only for Ada"
    );
  });

  it("still loads a different partition for the same namespace", async () => {
    const billingLoader = vi.fn(async (locale: string) =>
      locale === "it" ? billingIt : billingEn
    );
    const engine = new IcuTranslationProviderMulti<MultiSchema, TestMultiParams>({});
    const builder = createI18nBuilder(engine, {
      namespaceLoaders: { billing: billingLoader },
    });

    await builder.withNamespaces(["billing"]).withLocale("it").load();
    await builder.withNamespaces(["billing"]).withLocale("en").load();

    expect(billingLoader).toHaveBeenCalledTimes(2);
    expect(billingLoader).toHaveBeenNthCalledWith(1, "it");
    expect(billingLoader).toHaveBeenNthCalledWith(2, "en");
  });
});

describe("I18nBuilder single", () => {
  it("load() invokes a locale loader and returns a bound view", async () => {
    const dictionaryLoader = vi.fn(async (locale: string) => {
      return locale === "it"
        ? {
            login_button: { it: "Accedi" },
            welcome: { it: "Benvenuto {name}!" },
          }
        : {
            login_button: { en: "Login" },
            welcome: { en: "Welcome {name}!" },
          };
    });
    const engine = new IcuTranslationProviderSingle<SingleSchema, SingleParams>({
      login_button: { en: "", it: "" },
      welcome: { en: "", it: "" },
    });

    const view = await createI18nBuilder<SingleSchema, SingleParams>(engine, { dictionaryLoader })
      .withLocale("it")
      .load();

    expect(dictionaryLoader).toHaveBeenCalledWith("it");
    expect(view.locale).toBe("it");
    expect(view.t("login_button")).toBe("Accedi");
    expect(view.t("welcome", { name: "Ada" })).toBe("Benvenuto Ada!");
  });

  it("patches a preloaded key via scope.set() after load()", async () => {
    const dictionaryLoader = vi.fn(async () => ({
      login_button: { en: "Login" },
      welcome: { en: "Welcome {name}!" },
    }));
    const engine = new IcuTranslationProviderSingle<SingleSchema, SingleParams>({
      login_button: { en: "", it: "" },
      welcome: { en: "", it: "" },
    });

    const view = await createI18nBuilder<SingleSchema, SingleParams>(engine, { dictionaryLoader })
      .withLocale("en")
      .load();

    view.set("login_button", "Sign in");

    expect(view.t("login_button")).toBe("Sign in");
    expect(view.t("welcome", { name: "Ada" })).toBe("Welcome Ada!");
  });

  it("throws when scope.set() targets a key that was not preloaded", async () => {
    const dictionaryLoader = vi.fn(async () => ({
      login_button: { en: "Login" },
      welcome: { en: "Welcome {name}!" },
    }));
    const engine = new IcuTranslationProviderSingle<SingleSchema, SingleParams>({
      // @ts-expect-error
      login_button: { en: "" },
      // @ts-expect-error
      welcome: { en: "" },
    });

    const view = await createI18nBuilder<SingleSchema, SingleParams>(engine, { dictionaryLoader })
      .withLocale("en")
      .load();

    // @ts-expect-error
    expect(() => view.forLocale("it").set("login_button", "Accedi")).toThrow(
      "[i18n] Key not preloaded: login_button (it)"
    );
  });

  it("skips a repeated load for the same locale partition", async () => {
    const dictionaryLoader = vi.fn(async () => ({
      login_button: { en: "Login" },
      welcome: { en: "Welcome {name}!" },
    }));
    const engine = new IcuTranslationProviderSingle<SingleSchema, SingleParams>({
      login_button: { en: "", it: "" },
      welcome: { en: "", it: "" },
    });
    const options = { dictionaryLoader };
    const chain = () =>
      createI18nBuilder<SingleSchema, SingleParams>(engine, options).withLocale("en");

    await chain().load();
    await chain().load();

    expect(dictionaryLoader).toHaveBeenCalledTimes(1);
  });

  it("preserves runtime patches when a later builder reloads the same resource", async () => {
    const dictionaryLoader = vi.fn(async () => ({
      login_button: { en: "Login" },
      welcome: { en: "Welcome {name}!" },
    }));
    const engine = new IcuTranslationProviderSingle<SingleSchema, SingleParams>({
      login_button: { en: "", it: "" },
      welcome: { en: "", it: "" },
    });
    const options = { dictionaryLoader };

    const firstView = await createI18nBuilder<SingleSchema, SingleParams>(engine, options)
      .withLocale("en")
      .load();

    firstView.set("login_button", "Sign in");

    const secondView = await createI18nBuilder<SingleSchema, SingleParams>(engine, options)
      .withLocale("en")
      .load();

    expect(dictionaryLoader).toHaveBeenCalledTimes(1);
    expect(secondView.t("login_button")).toBe("Sign in");
    expect(secondView.t("welcome", { name: "Ada" })).toBe("Welcome Ada!");
  });
});
