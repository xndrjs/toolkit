import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function readGenerated(name: string): string {
  return readFileSync(join(appDir, "generated", name), "utf8");
}

describe("contentful-to-zod demo codegen outputs", () => {
  it("flat emits flat fields and enums, without localized/locale primitives", () => {
    const source = readGenerated("flat.schemas.ts");

    expect(source).toContain("export const ArticleFieldsSchema");
    expect(source).toContain("export const AuthorFieldsSchema");
    expect(source).toContain('z.enum(["draft", "review", "published"])');
    expect(source).toContain("z.union([z.literal(1), z.literal(2), z.literal(3)])");
    expect(source).toContain('z.enum(["news", "guide", "opinion"])');
    expect(source).not.toContain("ArticleLocalizedFieldsSchema");
    expect(source).not.toContain("CONTENTFUL_LOCALE_CODES");
    expect(source).not.toContain("flattenArticleLocalizedFields");
  });

  it("flat + localized-only emits flat + localized + flatten helpers", () => {
    const source = readGenerated("flat-localized.schemas.ts");

    expect(source).toContain("export const CONTENTFUL_LOCALE_CODES");
    expect(source).toContain("export const ContentfulEntryEnvelopeSchema");
    expect(source).toContain("export const ArticleFieldsSchema");
    expect(source).toContain("export const ArticleLocalizedFieldsSchema");
    expect(source).toContain("export const ArticleLocalizedEntrySchema");
    expect(source).toContain("export function flattenArticleLocalizedFields");
    expect(source).toContain("pickLocale");
    expect(source).not.toContain("LocaleStar");
  });

  it("localized-only emits localized entry schemas without flat/flatten", () => {
    const source = readGenerated("localized-only.schemas.ts");

    expect(source).toContain("export const CONTENTFUL_LOCALE_CODES");
    expect(source).toContain("export const ContentfulEntryEnvelopeSchema");
    expect(source).toContain("export const ArticleLocalizedFieldsSchema");
    expect(source).toContain("export const ArticleLocalizedEntrySchema");
    expect(source).not.toContain("ArticleFieldsSchema");
    expect(source).not.toContain("flattenArticleLocalizedFields");
  });

  it("all modes still emit flat + localized-only until LocaleStar emission lands", () => {
    const source = readGenerated("all-modes.schemas.ts");

    expect(source).toContain("export const ArticleFieldsSchema");
    expect(source).toContain("export const ArticleLocalizedFieldsSchema");
    expect(source).toContain("export function flattenArticleLocalizedFields");
  });
});
