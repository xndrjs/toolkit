import { describe, expectTypeOf, it } from "vitest";
import { createI18nHandle } from "./builder.js";
import type { I18nHandle } from "./i18n-handle.js";
import { IcuTranslationProviderMulti } from "./IcuTranslationProviderMulti.js";
import type { LocalesForDeliveryArea, LocalesForDeliveryAreaOrAll } from "./builder-types.js";
import type { PartialMultiDictionary } from "./types.js";

type TypestateSchema = {
  billing: { invoice_summary: { en: string; it: string } };
};

type TypestateParams = {
  billing: { invoice_summary: { count: number } };
};

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

describe("I18nHandle typestate", () => {
  it("exposes load / peek / serialize", () => {
    const engine = new IcuTranslationProviderMulti<TypestateSchema, TypestateParams>({});
    const handle = createI18nHandle(engine);
    expectTypeOf(handle).toMatchTypeOf<I18nHandle<TypestateSchema, TypestateParams>>();
    expectTypeOf(handle.serialize).returns.toEqualTypeOf<{
      dictionary: PartialMultiDictionary<TypestateSchema>;
      resources: readonly (readonly [string, string])[];
    }>();
  });
});
