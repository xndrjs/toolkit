import { describe, expect, it } from "vitest";

import { loadFixtureContentTypes, loadFixtureLocales } from "../test/fixtures";
import { importGeneratedModule } from "../test/import-generated";
import { generateZodSchemas } from "./generate-file";

const contentTypes = loadFixtureContentTypes();
const locales = loadFixtureLocales();

interface GeneratedHelpers {
  pickLocale: <T>(
    value: Partial<Record<"en-US" | "it-IT", T>> | T | undefined,
    locale?: "en-US" | "it-IT"
  ) => T | undefined;
  flattenBlogPostFields: (
    fields: {
      title: Partial<Record<"en-US" | "it-IT", string>>;
      slug: string;
      author?: unknown;
      excerpt?: Partial<Record<"en-US" | "it-IT", string>>;
    },
    locale?: "en-US" | "it-IT"
  ) => {
    title: string | undefined;
    slug: string;
    author?: unknown;
    excerpt?: string | undefined;
  };
  CONTENTFUL_DEFAULT_LOCALE: "en-US";
}

async function loadHelpers() {
  const source = generateZodSchemas(contentTypes, { locales, localeMode: "both" });
  return importGeneratedModule<GeneratedHelpers>(source);
}

describe("generated locale helpers", () => {
  it("pickLocale reads sparse locale maps without requiring the default locale", async () => {
    const { pickLocale } = await loadHelpers();

    expect(pickLocale({ "it-IT": "Ciao" }, "it-IT")).toBe("Ciao");
    expect(pickLocale({ "it-IT": "Ciao" }, "en-US")).toBeUndefined();
    expect(pickLocale("already-flat")).toBe("already-flat");
    expect(pickLocale(undefined)).toBeUndefined();
  });

  it("flattenBlogPostFields maps delivery fields to flat shape for a locale", async () => {
    const { flattenBlogPostFields } = await loadHelpers();

    const flat = flattenBlogPostFields(
      {
        title: { "it-IT": "Titolo" },
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
