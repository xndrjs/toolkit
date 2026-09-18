import { describe, expect, it } from "vitest";

import { loadFixtureContentTypes, loadFixtureLocales } from "../test/fixtures";
import { importGeneratedModule } from "../test/import-generated";
import { generateZodSchemas } from "./generate-file";

const contentTypes = loadFixtureContentTypes();
const locales = loadFixtureLocales();

interface GeneratedEntryHelpers {
  ContentfulEntryEnvelopeSchema: {
    parse: (value: unknown) => {
      sys: { id: string; type: "Entry"; contentType: { sys: { id: string } } };
      fields: Record<string, unknown>;
    };
    safeParse: (value: unknown) => { success: boolean };
  };
  BlogPostLocalizedEntrySchema: {
    parse: (value: unknown) => {
      sys: { id: string; contentType: { sys: { id: string } } };
      fields: { title: Record<string, string> | null; slug: string | null };
    };
  };
  flattenBlogPostLocalizedFields: (
    fields: {
      title: Record<"en-US" | "it-IT", string> | null;
      slug: string | null;
    },
    locale?: "en-US" | "it-IT"
  ) => {
    title: string | null;
    slug: string | null;
  };
}

async function loadEntryModule() {
  const source = generateZodSchemas(contentTypes, {
    locales,
    localeModes: ["flat", "localized-only"],
  });
  return importGeneratedModule<GeneratedEntryHelpers>(source);
}

describe("generated entry schemas", () => {
  it("ContentfulEntryEnvelopeSchema accepts any content type with untyped fields", async () => {
    const { ContentfulEntryEnvelopeSchema } = await loadEntryModule();

    const parsed = ContentfulEntryEnvelopeSchema.parse({
      sys: {
        id: "entry-1",
        type: "Entry",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        revision: 1,
        contentType: {
          sys: { type: "Link", linkType: "ContentType", id: "unknownType" },
        },
        space: { sys: { type: "Link", linkType: "Space", id: "space-1" } },
        environment: { sys: { type: "Link", linkType: "Environment", id: "master" } },
      },
      fields: {
        title: { "en-US": "Hello" },
        anything: 42,
      },
    });

    expect(parsed.sys.contentType.sys.id).toBe("unknownType");
    expect(parsed.fields.anything).toBe(42);
  });

  it("ContentfulEntryEnvelopeSchema rejects non-entry payloads", async () => {
    const { ContentfulEntryEnvelopeSchema } = await loadEntryModule();

    expect(
      ContentfulEntryEnvelopeSchema.safeParse({ sys: { type: "Asset" }, fields: {} }).success
    ).toBe(false);
    expect(ContentfulEntryEnvelopeSchema.safeParse({ fields: {} }).success).toBe(false);
  });

  it("BlogPostLocalizedEntrySchema parses delivery entries with loose sys passthrough", async () => {
    const { BlogPostLocalizedEntrySchema } = await loadEntryModule();

    const parsed = BlogPostLocalizedEntrySchema.parse({
      sys: {
        id: "entry-1",
        type: "Entry",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        revision: 1,
        publishedVersion: 3,
        locale: "en-US",
        contentType: {
          sys: { type: "Link", linkType: "ContentType", id: "blogPost" },
        },
        space: { sys: { type: "Link", linkType: "Space", id: "space-1" } },
        environment: { sys: { type: "Link", linkType: "Environment", id: "master" } },
        customField: "preserved",
      },
      fields: {
        title: { "en-US": "Hello", "it-IT": "Ciao" },
        slug: "hello",
      },
    });

    expect(parsed.sys.id).toBe("entry-1");
    expect(parsed.sys.contentType.sys.id).toBe("blogPost");
    expect((parsed.sys as { customField?: string }).customField).toBe("preserved");
  });

  it("BlogPostLocalizedEntrySchema rejects wrong content type id", async () => {
    const { BlogPostLocalizedEntrySchema } = await loadEntryModule();

    expect(() =>
      BlogPostLocalizedEntrySchema.parse({
        sys: {
          id: "entry-1",
          type: "Entry",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
          revision: 1,
          contentType: {
            sys: { type: "Link", linkType: "ContentType", id: "wrongType" },
          },
          space: { sys: { type: "Link", linkType: "Space", id: "space-1" } },
          environment: { sys: { type: "Link", linkType: "Environment", id: "master" } },
        },
        fields: { title: null, slug: null },
      })
    ).toThrow();
  });

  it("flattenBlogPostLocalizedFields maps delivery fields to flat shape", async () => {
    const { flattenBlogPostLocalizedFields } = await loadEntryModule();

    const flat = flattenBlogPostLocalizedFields(
      {
        title: { "en-US": "Hello", "it-IT": "Ciao" },
        slug: "hello",
      },
      "it-IT"
    );

    expect(flat).toMatchObject({ title: "Ciao", slug: "hello" });
  });
});
