import { describe, expect, it } from "vitest";

import type { Locale } from "../model/locale";
import { emitLocalePrimitives } from "./locale-primitives";

const locales: Locale[] = [
  { code: "en-US", default: true },
  { code: "it-IT", default: false },
];

describe("emitLocalePrimitives", () => {
  it("emits locale codes values-first before the Zod schema", () => {
    const output = emitLocalePrimitives(locales);

    expect(output).toContain('export const CONTENTFUL_LOCALE_CODES = ["en-US", "it-IT"] as const;');
    expect(output).toContain(
      "export type ContentfulLocaleCode = (typeof CONTENTFUL_LOCALE_CODES)[number];"
    );
    expect(output).toContain(
      "export const ContentfulLocaleCodeSchema = z.enum(CONTENTFUL_LOCALE_CODES);"
    );
    expect(output).toContain('export const CONTENTFUL_DEFAULT_LOCALE = "en-US" as const;');
    expect(output).not.toContain("ContentfulLocaleCodeSchema.options");
    expect(output).not.toContain("z.infer<typeof ContentfulLocaleCodeSchema>");
  });

  it("throws when there are no locales", () => {
    expect(() => emitLocalePrimitives([])).toThrow("At least one locale is required");
  });
});
