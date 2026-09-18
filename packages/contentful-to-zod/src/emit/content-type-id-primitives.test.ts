import { describe, expect, it } from "vitest";

import type { ContentType } from "../model/content-type";
import { emitContentTypeIdPrimitives } from "./content-type-id-primitives";

const author: ContentType = {
  id: "author",
  name: "Author",
  fields: [],
};

const blogPost: ContentType = {
  id: "blogPost",
  name: "Blog Post",
  fields: [],
};

describe("emitContentTypeIdPrimitives", () => {
  it("emits content type id enum without entry maps", () => {
    const output = emitContentTypeIdPrimitives([author, blogPost], {
      includeEntryMaps: false,
    });

    expect(output).toContain(
      'export const CONTENTFUL_CONTENT_TYPE_IDS = ["author", "blogPost"] as const;'
    );
    expect(output).toContain(
      "export type ContentfulContentTypeId = (typeof CONTENTFUL_CONTENT_TYPE_IDS)[number];"
    );
    expect(output).toContain(
      "export const ContentfulContentTypeIdSchema = z.enum(CONTENTFUL_CONTENT_TYPE_IDS);"
    );
    expect(output).not.toContain("ContentfulContentTypeIdSchema.options");
    expect(output).not.toContain("z.infer<typeof ContentfulContentTypeIdSchema>");
    expect(output).not.toContain("ContentfulLocalizedEntryByContentType");
    expect(output).not.toContain("ContentfulLocalizedEntrySchemaByContentType");
  });

  it("emits typed entry maps when delivery entry schemas are included", () => {
    const output = emitContentTypeIdPrimitives([author, blogPost], {
      includeEntryMaps: true,
    });

    expect(output).toContain("export type ContentfulLocalizedEntryByContentType = {");
    expect(output).toContain('  "author": AuthorLocalizedEntry;');
    expect(output).toContain('  "blogPost": BlogPostLocalizedEntry;');
    expect(output).toContain("export const ContentfulLocalizedEntrySchemaByContentType = {");
    expect(output).toContain('  "author": AuthorLocalizedEntrySchema,');
    expect(output).toContain('  "blogPost": BlogPostLocalizedEntrySchema,');
    expect(output).toContain(
      "} as const satisfies {\n  [K in ContentfulContentTypeId]: z.ZodType<ContentfulLocalizedEntryByContentType[K]>;"
    );
    expect(output).not.toContain("ContentfulLocaleStarEntryByContentType");
  });

  it("emits locale-star entry maps when requested", () => {
    const output = emitContentTypeIdPrimitives([author, blogPost], {
      includeLocaleStarEntryMaps: true,
    });

    expect(output).toContain("export type ContentfulLocaleStarEntryByContentType = {");
    expect(output).toContain('  "author": AuthorLocaleStarEntry;');
    expect(output).toContain('  "blogPost": BlogPostLocaleStarEntry;');
    expect(output).toContain("export const ContentfulLocaleStarEntrySchemaByContentType = {");
    expect(output).toContain('  "author": AuthorLocaleStarEntrySchema,');
    expect(output).toContain('  "blogPost": BlogPostLocaleStarEntrySchema,');
    expect(output).toContain("ContentfulResolvedLocaleStarEntrySchema");
    expect(output).not.toContain("ContentfulLocalizedEntryByContentType");
  });

  it("throws when there are no content types", () => {
    expect(() => emitContentTypeIdPrimitives([], { includeEntryMaps: false })).toThrow(
      "At least one content type is required"
    );
  });
});
