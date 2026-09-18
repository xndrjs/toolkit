import { describe, expect, it } from "vitest";

import { loadFixtureContentTypes, loadFixtureLocales } from "../test/fixtures";
import { importGeneratedModule } from "../test/import-generated";
import { generateZodSchemas } from "./generate-file";

const contentTypes = loadFixtureContentTypes();
const locales = loadFixtureLocales();

interface GeneratedHelpers {
  pickLocale: <T>(
    value: Record<"en-US" | "it-IT", T> | null,
    locale?: "en-US" | "it-IT"
  ) => T | null;
  flattenBlogPostLocalizedFields: (
    fields: {
      title: Record<"en-US" | "it-IT", string> | null;
      slug: string | null;
      author?: unknown;
      excerpt?: Record<"en-US" | "it-IT", string> | null;
    },
    _locale?: "en-US" | "it-IT"
  ) => {
    title: string | null;
    slug: string | null;
    author?: unknown;
    excerpt?: string | null;
  };
  CONTENTFUL_DEFAULT_LOCALE: "en-US";
}

async function loadHelpers() {
  const source = generateZodSchemas(contentTypes, {
    locales,
    localeModes: ["flat", "localized-only"],
  });
  return importGeneratedModule<GeneratedHelpers>(source);
}

describe("generated locale helpers", () => {
  it("pickLocale reads locale maps and returns null for missing locale or null input", async () => {
    const { pickLocale } = await loadHelpers();

    expect(pickLocale({ "it-IT": "Ciao", "en-US": "Hello" }, "it-IT")).toBe("Ciao");
    expect(pickLocale({ "it-IT": "Ciao", "en-US": "Hello" }, "en-US")).toBe("Hello");
    expect(pickLocale({ "it-IT": "Ciao", "en-US": "Hello" }, "en-US")).toBe("Hello");
    expect(
      pickLocale({ "it-IT": "Ciao" } as Record<"en-US" | "it-IT", string>, "en-US")
    ).toBeNull();
    expect(pickLocale(null)).toBeNull();
  });

  it("flattenBlogPostLocalizedFields maps delivery fields to flat shape for a locale", async () => {
    const { flattenBlogPostLocalizedFields } = await loadHelpers();

    const flat = flattenBlogPostLocalizedFields(
      {
        title: { "en-US": "Hello", "it-IT": "Titolo" },
        slug: "my-post",
        excerpt: { "en-US": "Summary", "it-IT": "Riassunto" },
      },
      "it-IT"
    );

    expect(flat).toEqual({
      title: "Titolo",
      slug: "my-post",
      status: null,
      priority: null,
      tags: null,
      author: null,
      excerpt: "Riassunto",
      metadata: null,
    });
  });

  it("flattenBlogPostLocalizedFields falls back to CONTENTFUL_DEFAULT_LOCALE when locale is omitted", async () => {
    const { flattenBlogPostLocalizedFields, CONTENTFUL_DEFAULT_LOCALE } = await loadHelpers();

    expect(CONTENTFUL_DEFAULT_LOCALE).toBe("en-US");

    const flat = flattenBlogPostLocalizedFields({
      title: { "en-US": "Hello", "it-IT": "Ciao" },
      slug: "my-post",
    });

    expect(flat.title).toBe("Hello");
  });

  it("flattenBlogPostLocalizedFields coalesces absent non-localized fields to null", async () => {
    const { flattenBlogPostLocalizedFields } = await loadHelpers();

    // @ts-expect-error partial fields — flatten coalesces absent keys with ?? null at runtime
    const flat = flattenBlogPostLocalizedFields({
      title: { "en-US": "Hello", "it-IT": "Ciao" },
    });

    expect(flat.slug).toBeNull();
    expect(flat.author).toBeNull();
  });

  it("BlogPostFieldsSchema normalizes undefined flat values to null", async () => {
    const source = generateZodSchemas(contentTypes, {
      locales,
      localeModes: ["flat", "localized-only"],
    });
    const mod = await importGeneratedModule<{
      BlogPostFieldsSchema: { parse: (value: unknown) => Record<string, unknown> };
    }>(source);

    expect(
      mod.BlogPostFieldsSchema.parse({
        title: null,
        slug: undefined,
        author: undefined,
        excerpt: undefined,
      })
    ).toEqual({
      title: null,
      slug: null,
      status: null,
      priority: null,
      tags: null,
      author: null,
      excerpt: null,
      metadata: null,
    });
  });

  it("BlogPostLocalizedEntrySchema accepts omitted required transport fields", async () => {
    const source = generateZodSchemas(contentTypes, {
      locales,
      localeModes: ["flat", "localized-only"],
    });
    const mod = await importGeneratedModule<{
      BlogPostLocalizedEntrySchema: {
        parse: (value: unknown) => {
          fields: { title: unknown; slug: unknown };
        };
      };
      BlogPostFieldsSchema: { parse: (value: unknown) => unknown };
      flattenBlogPostLocalizedFields: (fields: unknown, locale?: string) => unknown;
    }>(source);

    const entry = mod.BlogPostLocalizedEntrySchema.parse({
      sys: {
        id: "entry-1",
        type: "Entry",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        revision: 1,
        contentType: {
          sys: { type: "Link", linkType: "ContentType", id: "blogPost" },
        },
        space: { sys: { type: "Link", linkType: "Space", id: "space" } },
        environment: { sys: { type: "Link", linkType: "Environment", id: "master" } },
      },
      fields: {
        slug: "draft-without-title",
      },
    });

    expect(entry.fields.title).toBeNull();

    const flat = mod.flattenBlogPostLocalizedFields(entry.fields, "en-US");
    expect(mod.BlogPostFieldsSchema.parse(flat)).toEqual({
      title: null,
      slug: "draft-without-title",
      status: null,
      priority: null,
      tags: null,
      author: null,
      excerpt: null,
      metadata: null,
    });
  });
});
