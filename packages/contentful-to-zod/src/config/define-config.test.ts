import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  defineConfig,
  normalizeFieldLocalizationModes,
  resolveFieldLocalizationFlags,
  resolveFieldLocalizationModes,
} from "./define-config";

describe("defineConfig", () => {
  it("defaults locale.modes to flat + localized-only", () => {
    expect(defineConfig({})).toEqual({
      locale: { modes: ["flat", "localized-only"] },
    });
  });

  it("preserves explicit locale.modes and objects", () => {
    const metadataSchema = z.object({ title: z.string() });

    expect(
      defineConfig({
        locale: { modes: ["flat"] },
        objects: { "blogPost.metadata": metadataSchema },
      })
    ).toEqual({
      locale: { modes: ["flat"] },
      objects: { "blogPost.metadata": metadataSchema },
    });
  });

  it("dedupes modes and preserves order", () => {
    expect(
      defineConfig({
        locale: { modes: ["all", "flat", "all", "localized-only"] },
      })
    ).toEqual({
      locale: { modes: ["all", "flat", "localized-only"] },
    });
  });

  it("rejects unknown modes", () => {
    expect(() =>
      defineConfig({
        locale: { modes: ["delivery" as "flat"] },
      })
    ).toThrow(/Unknown field localization mode "delivery"/);
  });
});

describe("normalizeFieldLocalizationModes", () => {
  it("defaults when undefined or empty", () => {
    expect(normalizeFieldLocalizationModes(undefined)).toEqual(["flat", "localized-only"]);
  });
});

describe("resolveFieldLocalizationModes", () => {
  it("prefers explicit localeModes over config", () => {
    expect(
      resolveFieldLocalizationModes({
        localeModes: ["all"],
        config: defineConfig({ locale: { modes: ["flat"] } }),
      })
    ).toEqual(["all"]);
  });

  it("falls back to config locale.modes", () => {
    expect(
      resolveFieldLocalizationModes({
        config: defineConfig({ locale: { modes: ["localized-only"] } }),
      })
    ).toEqual(["localized-only"]);
  });

  it("defaults when unset", () => {
    expect(resolveFieldLocalizationModes({})).toEqual(["flat", "localized-only"]);
  });
});

describe("resolveFieldLocalizationFlags", () => {
  it("sets flatten only when both flat and localized-only are present", () => {
    expect(
      resolveFieldLocalizationFlags({ localeModes: ["flat", "localized-only"] })
    ).toMatchObject({
      includeFlat: true,
      includeLocalizedOnly: true,
      includeAll: false,
      needsLocales: true,
      includePickLocale: true,
      includeFlatten: true,
      includeFlattenLocaleStar: false,
    });

    expect(resolveFieldLocalizationFlags({ localeModes: ["localized-only"] })).toMatchObject({
      includeFlatten: false,
      includeFlattenLocaleStar: false,
      includePickLocale: true,
      needsLocales: true,
    });

    expect(resolveFieldLocalizationFlags({ localeModes: ["flat"] })).toMatchObject({
      includeFlatten: false,
      includeFlattenLocaleStar: false,
      includePickLocale: false,
      needsLocales: false,
    });
  });

  it("needs locales when all is selected", () => {
    expect(resolveFieldLocalizationFlags({ localeModes: ["all"] })).toMatchObject({
      includeAll: true,
      needsLocales: true,
      includePickLocale: true,
      includeFlatten: false,
      includeFlattenLocaleStar: false,
    });
  });

  it("sets localeStar flatten when both flat and all are present", () => {
    expect(resolveFieldLocalizationFlags({ localeModes: ["flat", "all"] })).toMatchObject({
      includeFlatten: false,
      includeFlattenLocaleStar: true,
      includePickLocale: true,
    });

    expect(
      resolveFieldLocalizationFlags({ localeModes: ["flat", "localized-only", "all"] })
    ).toMatchObject({
      includeFlatten: true,
      includeFlattenLocaleStar: true,
    });
  });
});
