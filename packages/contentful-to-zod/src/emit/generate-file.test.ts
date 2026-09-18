import { describe, expect, it } from "vitest";

import { loadFixtureContentTypes, loadFixtureLocales } from "../test/fixtures";
import { generateZodSchemas } from "./generate-file";

const contentTypes = loadFixtureContentTypes();
const locales = loadFixtureLocales();

describe("generateZodSchemas locale modes", () => {
  it("default modes emit flat + localized-only schemas plus flatten helpers", () => {
    const output = generateZodSchemas(contentTypes, {
      locales,
      localeModes: ["flat", "localized-only"],
    });

    expect(output).toMatchSnapshot();
    expect(output).toContain("export const BlogPostFieldsSchema");
    expect(output).toContain("export const BlogPostLocalizedFieldsSchema");
    expect(output).toContain("export const BlogPostLocalizedEntrySchema");
    expect(output).toContain("export const CONTENTFUL_LOCALE_CODES");
    expect(output).toContain("export const ContentfulEntrySysSchema");
    expect(output).toContain("export const ContentfulEntryEnvelopeSchema");
    expect(output).toContain("export const ContentfulAssetSysSchema");
    expect(output).toContain("export const ContentfulAssetSchema");
    expect(output).toContain(
      "export type ContentfulResolvedLocalizedEntry = z.infer<typeof ContentfulResolvedLocalizedEntrySchema>"
    );
    expect(output).toContain("export function flattenBlogPostLocalizedFields");
    expect(output).toContain("export function pickLocale");
    expect(output).toContain("export function parseEntryAsLinkField");
    expect(output).toContain("export function getAllowedEntryLinkContentTypes");
    expect(output).toContain("export class LinkFieldTargetError");
    expect(output).toContain("LINK_FIELD_ALLOWED_CONTENT_TYPES");
    expect(output).toContain(
      'export const CONTENTFUL_CONTENT_TYPE_IDS = ["author", "blogPost"] as const'
    );
    expect(output).toContain("export const ContentfulLocalizedEntrySchemaByContentType");
    expect(output).toContain("export const LINK_FIELDS_BY_CONTENT_TYPE");
    expect(output).toContain('export const BLOG_POST_STATUSES = ["draft", "published"] as const');
    expect(output).toContain("export const BlogPostStatusSchema = z.enum(BLOG_POST_STATUSES)");
    expect(output).toContain('"status": flatField(BlogPostStatusSchema)');
    expect(output).toContain('"status": transportField(BlogPostStatusSchema)');
    expect(output).toContain(
      "export const BlogPostPrioritySchema = z.union([z.literal(1), z.literal(2), z.literal(3)])"
    );
    expect(output).toContain('"tags": flatField(z.array(BlogPostTagsSchema).max(5))');
  });

  it("mode flat emits flat schemas without localized/locale primitives", () => {
    const output = generateZodSchemas(contentTypes, { localeModes: ["flat"] });

    expect(output).toMatchSnapshot();
    expect(output).toContain("export const BlogPostFieldsSchema");
    expect(output).not.toContain("BlogPostLocalizedFieldsSchema");
    expect(output).not.toContain("ContentfulLocaleCodeSchema");
    expect(output).not.toContain("ContentfulEntrySysSchema");
    expect(output).not.toContain("flattenBlogPostLocalizedFields");
    expect(output).not.toContain("parseEntryAsLinkField");
    expect(output).toContain(
      'export const CONTENTFUL_CONTENT_TYPE_IDS = ["author", "blogPost"] as const'
    );
    expect(output).not.toContain("ContentfulLocalizedEntrySchemaByContentType");
    expect(output).not.toContain("LINK_FIELDS_BY_CONTENT_TYPE");
  });

  it("mode localized-only emits localized schemas and pickLocale without flatten helpers", () => {
    const output = generateZodSchemas(contentTypes, {
      locales,
      localeModes: ["localized-only"],
    });

    expect(output).toMatchSnapshot();
    expect(output).not.toContain("export const BlogPostFieldsSchema");
    expect(output).toContain("export const BlogPostLocalizedFieldsSchema");
    expect(output).toContain("ContentfulEntrySysSchema");
    expect(output).toContain("pickLocale");
    expect(output).not.toContain("flattenBlogPostLocalizedFields");
    expect(output).toContain("parseEntryAsLinkField");
    expect(output).toContain("ContentfulLocalizedEntrySchemaByContentType");
    expect(output).toContain("LINK_FIELDS_BY_CONTENT_TYPE");
  });

  it("throws when locales are missing for localized-only or all", () => {
    expect(() =>
      generateZodSchemas(contentTypes, { localeModes: ["flat", "localized-only"] })
    ).toThrow('Locales are required when locale.modes includes "localized-only" or "all"');
  });
});
