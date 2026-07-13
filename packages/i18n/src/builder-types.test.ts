import { describe, expectTypeOf, it } from "vitest";
import type { LocalesForDeliveryArea, LocalesForDeliveryAreaOrAll } from "./builder-types.js";

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
