import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function readGenerated(name: string): string {
  return readFileSync(join(appDir, "generated", name), "utf8");
}

describe("contentful-to-zod demo codegen outputs", () => {
  it("cma emits flat fields and enums, without delivery/locale primitives", () => {
    const source = readGenerated("cma.schemas.ts");

    expect(source).toContain("export const ArticleFieldsSchema");
    expect(source).toContain("export const AuthorFieldsSchema");
    expect(source).toContain('z.enum(["draft", "review", "published"])');
    expect(source).toContain("z.union([z.literal(1), z.literal(2), z.literal(3)])");
    expect(source).toContain('z.enum(["news", "guide", "opinion"])');
    expect(source).not.toContain("ArticleDeliveryFieldsSchema");
    expect(source).not.toContain("CONTENTFUL_LOCALE_CODES");
    expect(source).not.toContain("flattenArticleEntryFields");
  });

  it("both (localeStar false) emits flat + delivery + flatten helpers", () => {
    const source = readGenerated("both.schemas.ts");

    expect(source).toContain("export const CONTENTFUL_LOCALE_CODES");
    expect(source).toContain("export const ArticleFieldsSchema");
    expect(source).toContain("export const ArticleDeliveryFieldsSchema");
    expect(source).toContain("export const ArticleEntrySchema");
    expect(source).toContain("export function flattenArticleEntryFields");
    expect(source).toContain("pickLocale");
    expect(source).not.toContain("LocaleStar");
  });

  it("delivery + localeStar accepts config and emits delivery entry schemas", () => {
    const source = readGenerated("delivery-locale-star.schemas.ts");

    expect(source).toContain("export const CONTENTFUL_LOCALE_CODES");
    expect(source).toContain("export const ArticleDeliveryFieldsSchema");
    expect(source).toContain("export const ArticleEntrySchema");
    expect(source).not.toContain("ArticleFieldsSchema");
    expect(source).not.toContain("flattenArticleEntryFields");
  });

  it("both + localeStar emits flat + delivery like both mode", () => {
    const source = readGenerated("both-locale-star.schemas.ts");

    expect(source).toContain("export const ArticleFieldsSchema");
    expect(source).toContain("export const ArticleDeliveryFieldsSchema");
    expect(source).toContain("export function flattenArticleEntryFields");
  });
});
