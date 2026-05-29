import { describe, expect, it } from "vitest";

import { loadFixtureContentTypes, loadFixtureLocales } from "../test/fixtures";
import { generateZodSchemas } from "./generate-file";

const contentTypes = loadFixtureContentTypes();
const locales = loadFixtureLocales();

describe("generateZodSchemas locale modes", () => {
  it("mode both emits flat and delivery schemas plus flatten helpers", () => {
    const output = generateZodSchemas(contentTypes, { locales, localeMode: "both" });

    expect(output).toMatchSnapshot();
    expect(output).toContain("export const BlogPostSchema");
    expect(output).toContain("export const BlogPostDeliverySchema");
    expect(output).toContain("export function pickLocale");
    expect(output).toContain("export function flattenBlogPostFields");
    expect(output).toContain('"title": z.record(ContentfulLocaleCodeSchema, z.string().max(256))');
    expect(output).toContain('"slug": z.string()');
  });

  it("mode cma emits only flat schemas without locale primitives or helpers", () => {
    const output = generateZodSchemas(contentTypes, { localeMode: "cma" });

    expect(output).toMatchSnapshot();
    expect(output).toContain("export const BlogPostSchema");
    expect(output).not.toContain("BlogPostDeliverySchema");
    expect(output).not.toContain("ContentfulLocaleCodeSchema");
    expect(output).not.toContain("export function pickLocale");
    expect(output).not.toContain("export function flattenBlogPostFields");
  });

  it("mode delivery emits delivery schemas and pickLocale without flatten helpers", () => {
    const output = generateZodSchemas(contentTypes, { locales, localeMode: "delivery" });

    expect(output).toMatchSnapshot();
    expect(output).not.toContain("export const BlogPostSchema");
    expect(output).toContain("export const BlogPostDeliverySchema");
    expect(output).toContain("ContentfulLocaleCodeSchema");
    expect(output).toContain("export function pickLocale");
    expect(output).not.toContain("export function flattenBlogPostFields");
  });

  it("requires locales when delivery shape is included", () => {
    expect(() => generateZodSchemas(contentTypes, { localeMode: "both" })).toThrow(
      'Locales are required when locale mode is "both"'
    );
  });
});
