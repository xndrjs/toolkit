import { describe, expectTypeOf, it } from "vitest";
import { createI18nMultiBuilder } from "./builder.js";
import type { I18nBuilderMultiInitialImpl, I18nBuilderMultiReadyImpl } from "./builder-multi.js";
import { IcuTranslationProviderMulti } from "./IcuTranslationProviderMulti.js";
import type { LocalesForDeliveryArea, LocalesForDeliveryAreaOrAll } from "./builder-types.js";

type TypestateSchema = {
  billing: { invoice_summary: { en: string; it: string } };
};

type TypestateParams = {
  billing: { invoice_summary: { count: number } };
};

function assertBuilderTypestate(): void {
  const engine = new IcuTranslationProviderMulti<TypestateSchema, TypestateParams>({});
  const initial = createI18nMultiBuilder(engine);

  // @ts-expect-error withLocale requires withNamespaces first
  initial.withLocale("en");
  // @ts-expect-error load requires withNamespaces first
  void initial.load();
  // @ts-expect-error withDeliveryArea requires withNamespaces first
  initial.withDeliveryArea("eu");
  // @ts-expect-error empty namespace list is rejected
  initial.withNamespaces([]);

  const ready = initial.withNamespaces(["billing"]);
  ready.withLocale("en");
  void ready.load();
}

void assertBuilderTypestate;

describe("builder-types", () => {
  type ProjectLocale = "en" | "en-US" | "it" | "fr";
  type DeliveryArea = "eu" | "amer";
  type Artifacts = {
    eu: readonly ["en", "it", "fr"];
    amer: readonly ["en-US"];
  };

  it("LocalesForDeliveryArea indexes artifact locales", () => {
    expectTypeOf<LocalesForDeliveryArea<Artifacts, "eu">>().toEqualTypeOf<"en" | "it" | "fr">();
    expectTypeOf<LocalesForDeliveryArea<Artifacts, "amer">>().toEqualTypeOf<"en-US">();
  });

  it("LocalesForDeliveryAreaOrAll narrows only when a delivery map is configured", () => {
    expectTypeOf<
      LocalesForDeliveryAreaOrAll<ProjectLocale, DeliveryArea, Artifacts, "eu">
    >().toEqualTypeOf<"en" | "it" | "fr">();
    expectTypeOf<
      LocalesForDeliveryAreaOrAll<ProjectLocale, never, Record<string, never>, "eu">
    >().toEqualTypeOf<ProjectLocale>();
  });
});

describe("I18nBuilderMulti typestate", () => {
  it("initial builder only exposes withNamespaces", () => {
    const engine = new IcuTranslationProviderMulti<TypestateSchema, TypestateParams>({});
    const initial = createI18nMultiBuilder(engine);
    expectTypeOf(initial).toEqualTypeOf<
      I18nBuilderMultiInitialImpl<TypestateSchema, TypestateParams>
    >();
  });

  it("ready builder exposes partition and load", () => {
    const engine = new IcuTranslationProviderMulti<TypestateSchema, TypestateParams>({});
    const ready = createI18nMultiBuilder(engine).withNamespaces(["billing"]);
    expectTypeOf(ready).toEqualTypeOf<
      I18nBuilderMultiReadyImpl<
        TypestateSchema,
        TypestateParams,
        "en" | "it",
        "en" | "it",
        readonly ["billing"]
      >
    >();
  });
});
