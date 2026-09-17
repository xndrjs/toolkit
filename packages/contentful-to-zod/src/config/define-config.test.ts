import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  assertLocaleStarAllowed,
  defineConfig,
  resolveLocaleMode,
  resolveLocaleStar,
  type ContentfulToZodConfig,
} from "./define-config";

describe("defineConfig", () => {
  it("defaults locale.mode to both and localeStar to false", () => {
    expect(defineConfig({})).toEqual({
      locale: { mode: "both", localeStar: false },
    });
  });

  it("preserves explicit locale.mode and objects", () => {
    const metadataSchema = z.object({ title: z.string() });

    expect(
      defineConfig({
        locale: { mode: "cma" },
        objects: { "blogPost.metadata": metadataSchema },
      })
    ).toEqual({
      locale: { mode: "cma" },
      objects: { "blogPost.metadata": metadataSchema },
    });
  });

  it("preserves localeStar on delivery and both", () => {
    expect(defineConfig({ locale: { mode: "delivery", localeStar: true } })).toEqual({
      locale: { mode: "delivery", localeStar: true },
    });
    expect(defineConfig({ locale: { mode: "both", localeStar: true } })).toEqual({
      locale: { mode: "both", localeStar: true },
    });
  });

  it("rejects localeStar with cma mode at runtime", () => {
    expect(() =>
      defineConfig({
        // Untyped JS may pass this combination; assert at runtime.
        locale: { mode: "cma", localeStar: true } as ContentfulToZodConfig["locale"],
      })
    ).toThrow(/locale\.localeStar cannot be enabled when locale\.mode is "cma"/);
  });
});

describe("resolveLocaleMode", () => {
  it("prefers explicit localeMode over config", () => {
    expect(
      resolveLocaleMode({
        localeMode: "delivery",
        config: defineConfig({ locale: { mode: "cma" } }),
      })
    ).toBe("delivery");
  });

  it("falls back to config locale.mode", () => {
    expect(
      resolveLocaleMode({
        config: defineConfig({ locale: { mode: "delivery" } }),
      })
    ).toBe("delivery");
  });

  it("defaults to both when unset", () => {
    expect(resolveLocaleMode({})).toBe("both");
  });
});

describe("resolveLocaleStar", () => {
  it("defaults to false", () => {
    expect(resolveLocaleStar({})).toBe(false);
  });

  it("prefers explicit localeStar over config", () => {
    expect(
      resolveLocaleStar({
        localeStar: false,
        config: defineConfig({ locale: { mode: "both", localeStar: true } }),
      })
    ).toBe(false);
    expect(
      resolveLocaleStar({
        localeStar: true,
        config: defineConfig({ locale: { mode: "both", localeStar: false } }),
      })
    ).toBe(true);
  });

  it("falls back to config locale.localeStar", () => {
    expect(
      resolveLocaleStar({
        config: defineConfig({ locale: { mode: "delivery", localeStar: true } }),
      })
    ).toBe(true);
  });

  it("rejects localeStar when resolved mode is cma", () => {
    expect(() =>
      resolveLocaleStar({
        localeStar: true,
        localeMode: "cma",
      })
    ).toThrow(/locale\.localeStar cannot be enabled when locale\.mode is "cma"/);

    expect(() =>
      resolveLocaleStar({
        localeStar: true,
        config: { locale: { mode: "cma" } },
      })
    ).toThrow(/locale\.localeStar cannot be enabled when locale\.mode is "cma"/);
  });

  it("returns false for cma when localeStar is unset", () => {
    expect(resolveLocaleStar({ localeMode: "cma" })).toBe(false);
  });
});

describe("assertLocaleStarAllowed", () => {
  it("allows localeStar under delivery and both", () => {
    expect(() => assertLocaleStarAllowed("delivery", true)).not.toThrow();
    expect(() => assertLocaleStarAllowed("both", true)).not.toThrow();
  });

  it("allows unset or false under cma", () => {
    expect(() => assertLocaleStarAllowed("cma", undefined)).not.toThrow();
    expect(() => assertLocaleStarAllowed("cma", false)).not.toThrow();
  });
});
