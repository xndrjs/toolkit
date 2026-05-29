import { describe, expect, it } from "vitest";
import { z } from "zod";

import { defineConfig, resolveLocaleMode } from "./define-config";

describe("defineConfig", () => {
  it("defaults locale.mode to both", () => {
    expect(defineConfig({})).toEqual({
      locale: { mode: "both" },
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
