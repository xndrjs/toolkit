import { describe, expect, it } from "vitest";

import { loadFixtureContentTypes, loadFixtureLocales } from "../test/fixtures";
import { generateZodSchemas } from "./generate-file";

const contentTypes = loadFixtureContentTypes();
const locales = loadFixtureLocales();

describe("generateZodSchemas locale modes", () => {
  it("mode both emits flat and delivery schemas plus flatten helpers", () => {
    const output = generateZodSchemas(contentTypes, { locales, localeMode: "both" });

    expect(output).toMatchSnapshot();
    expect(output).toContain("export const BlogPostFieldsSchema");
    expect(output).toContain("export const BlogPostDeliveryFieldsSchema");
    expect(output).toContain("export const BlogPostEntrySchema");
    expect(output).toContain("export type BlogPostEntry = z.infer<typeof BlogPostEntrySchema>");
    expect(output).toContain("export const ContentfulEntrySysSchema");
    expect(output).toContain(
      "export type ContentfulEntryLink = z.infer<typeof ContentfulEntryLinkSchema>"
    );
    expect(output).toContain("export const ContentfulAssetSchema");
    expect(output).toContain(
      "export type ContentfulResolvedEntry = z.infer<typeof ContentfulResolvedEntrySchema>"
    );
    expect(output).toContain('id: z.literal("blogPost")');
    expect(output).toContain("export function pickLocale");
    expect(output).toContain("export function flattenBlogPostEntryFields");
    expect(output).toContain("export function parseEntryAsLinkField");
    expect(output).toContain("export function flatField");
    expect(output).toContain("export function transportField");
    expect(output).toContain('"title": flatField(z.string().max(256))');
    expect(output).toContain('"slug": transportField(z.string())');
    expect(output).toContain("export const ContentfulContentTypeIdSchema");
    expect(output).toContain("export type ContentfulEntryByContentType");
    expect(output).toContain("export const ContentfulEntrySchemaByContentType");
  });

  it("mode cma emits only flat schemas without locale primitives or helpers", () => {
    const output = generateZodSchemas(contentTypes, { localeMode: "cma" });

    expect(output).toMatchSnapshot();
    expect(output).toContain("export const BlogPostFieldsSchema");
    expect(output).not.toContain("BlogPostDeliveryFieldsSchema");
    expect(output).not.toContain("BlogPostEntrySchema");
    expect(output).not.toContain("ContentfulEntrySysSchema");
    expect(output).not.toContain("ContentfulLocaleCodeSchema");
    expect(output).not.toContain("export function pickLocale");
    expect(output).not.toContain("export function flattenBlogPostEntryFields");
    expect(output).toContain("export function flatField");
    expect(output).not.toContain("export function transportField");
    expect(output).toContain("export const ContentfulContentTypeIdSchema");
    expect(output).not.toContain("ContentfulEntryByContentType");
    expect(output).not.toContain("ContentfulEntrySchemaByContentType");
  });

  it("mode delivery emits delivery schemas and pickLocale without flatten helpers", () => {
    const output = generateZodSchemas(contentTypes, { locales, localeMode: "delivery" });

    expect(output).toMatchSnapshot();
    expect(output).not.toContain("export const BlogPostFieldsSchema");
    expect(output).toContain("export const BlogPostDeliveryFieldsSchema");
    expect(output).toContain("export const BlogPostEntrySchema");
    expect(output).toContain("ContentfulEntrySysSchema");
    expect(output).toContain("export function pickLocale");
    expect(output).not.toContain("export function flattenBlogPostEntryFields");
    expect(output).not.toContain("export function flattenBlogPostEntry");
    expect(output).not.toContain("export function flatField");
    expect(output).toContain("export function transportField");
    expect(output).toContain("export const ContentfulContentTypeIdSchema");
    expect(output).toContain("export type ContentfulEntryByContentType");
  });

  it("requires locales when delivery shape is included", () => {
    expect(() => generateZodSchemas(contentTypes, { localeMode: "both" })).toThrow(
      'Locales are required when locale mode is "both"'
    );
  });
});
