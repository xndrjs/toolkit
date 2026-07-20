import { describe, expect, it, vi } from "vitest";
import { createI18nHandle } from "./builder.js";
import { IcuTranslationProviderMulti } from "./IcuTranslationProviderMulti.js";
import { normalizeI18nCreateInput } from "./serialized-state.js";

type MultiSchema = {
  default: { greeting: { en: string; it: string } };
  billing: { invoice: { en: string; it: string } };
};
type MultiParams = {
  default: { greeting: never };
  billing: { invoice: never };
};

describe("serialize / createI18n({ state })", () => {
  it("normalizeI18nCreateInput defaults missing state to empty dictionary and [] resources", () => {
    expect(normalizeI18nCreateInput()).toEqual({
      dictionary: {},
      resources: [],
    });
  });

  it("normalizeI18nCreateInput defaults missing resources to []", () => {
    expect(normalizeI18nCreateInput({ dictionary: { greeting: { en: "Hi" } } })).toEqual({
      dictionary: { greeting: { en: "Hi" } },
      resources: [],
    });
  });

  it("serialize after load → fresh handle skips loaders for marked resources", async () => {
    const defaultLoader = vi.fn(async (locale: string) => ({
      greeting: { [locale]: locale === "it" ? "Ciao" : "Hello" },
    }));
    const billingLoader = vi.fn(async (locale: string) => ({
      invoice: { [locale]: locale === "it" ? "Fattura" : "Invoice" },
    }));

    const ssrEngine = new IcuTranslationProviderMulti<MultiSchema, MultiParams>({});
    const ssr = createI18nHandle(ssrEngine, {
      namespaceLoaders: {
        default: defaultLoader,
        billing: billingLoader,
      },
    });

    await ssr.load({ namespaces: ["default", "billing"], locale: "it" });
    expect(defaultLoader).toHaveBeenCalledTimes(1);
    expect(billingLoader).toHaveBeenCalledTimes(1);

    const serialized = ssr.serialize();
    expect(serialized.resources).toEqual(
      expect.arrayContaining([
        ["default", "it"],
        ["billing", "it"],
      ])
    );
    expect(serialized.dictionary.default?.greeting?.it).toBe("Ciao");

    const csrEngine = new IcuTranslationProviderMulti<MultiSchema, MultiParams>(
      serialized.dictionary
    );
    csrEngine.seedBuilderResources(serialized.resources);
    const csr = createI18nHandle(csrEngine, {
      namespaceLoaders: {
        default: defaultLoader,
        billing: billingLoader,
      },
    });

    expect(csrEngine.hasBuilderResourceLoaded("default", "it")).toBe(true);
    expect(csrEngine.hasBuilderResourceLoaded("billing", "it")).toBe(true);

    await csr.load({ namespaces: ["default", "billing"], locale: "it" });
    expect(defaultLoader).toHaveBeenCalledTimes(1);
    expect(billingLoader).toHaveBeenCalledTimes(1);

    const scope = csr.peek({ namespaces: ["default", "billing"], locale: "it" });
    expect(scope).not.toBeNull();
    expect(scope!.t("default", "greeting")).toBe("Ciao");
    expect(scope!.t("billing", "invoice")).toBe("Fattura");
  });

  it("peek returns scope after hydrate seed without invoking loaders", async () => {
    const defaultLoader = vi.fn(async (locale: string) => ({
      greeting: { [locale]: "Hello" },
    }));
    const billingLoader = vi.fn(async (locale: string) => ({
      invoice: { [locale]: "Invoice" },
    }));

    const ssrEngine = new IcuTranslationProviderMulti<MultiSchema, MultiParams>({});
    const ssr = createI18nHandle(ssrEngine, {
      namespaceLoaders: { default: defaultLoader, billing: billingLoader },
    });
    await ssr.load({ namespaces: ["default", "billing"], locale: "en" });
    const serialized = ssr.serialize();

    const csrEngine = new IcuTranslationProviderMulti<MultiSchema, MultiParams>(
      serialized.dictionary
    );
    csrEngine.seedBuilderResources(serialized.resources);
    const csr = createI18nHandle(csrEngine, {
      namespaceLoaders: { default: defaultLoader, billing: billingLoader },
    });

    const sync = csr.peek({ namespaces: ["default", "billing"], locale: "en" });
    expect(sync).not.toBeNull();
    expect(sync!.t("default", "greeting")).toBe("Hello");
    expect(defaultLoader).toHaveBeenCalledTimes(1);
    expect(billingLoader).toHaveBeenCalledTimes(1);

    expect(csr.peek({ namespaces: ["default"], locale: "it" })).toBeNull();
  });
});
