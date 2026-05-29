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
  flattenBlogPostFields: (
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
  const source = generateZodSchemas(contentTypes, { locales, localeMode: "both" });
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

  it("flattenBlogPostFields maps delivery fields to flat shape for a locale", async () => {
    const { flattenBlogPostFields } = await loadHelpers();

    const flat = flattenBlogPostFields(
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
      excerpt: "Riassunto",
    });
  });

  it("flattenBlogPostFields falls back to CONTENTFUL_DEFAULT_LOCALE when locale is omitted", async () => {
    const { flattenBlogPostFields, CONTENTFUL_DEFAULT_LOCALE } = await loadHelpers();

    expect(CONTENTFUL_DEFAULT_LOCALE).toBe("en-US");

    const flat = flattenBlogPostFields({
      title: { "en-US": "Hello", "it-IT": "Ciao" },
      slug: "my-post",
    });

    expect(flat.title).toBe("Hello");
  });
});
