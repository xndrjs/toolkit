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
      'export const ContentfulContentTypeIdSchema = z.enum(["author", "blogPost"])'
    );
    expect(output).toContain(
      "export type ContentfulContentTypeId = z.infer<typeof ContentfulContentTypeIdSchema>;"
    );
    expect(output).toContain(
      "export const CONTENTFUL_CONTENT_TYPE_IDS = ContentfulContentTypeIdSchema.options;"
    );
    expect(output).not.toContain("ContentfulEntryByContentType");
    expect(output).not.toContain("ContentfulEntrySchemaByContentType");
  });

  it("emits typed entry maps when delivery entry schemas are included", () => {
    const output = emitContentTypeIdPrimitives([author, blogPost], {
      includeEntryMaps: true,
    });

    expect(output).toContain("export type ContentfulEntryByContentType = {");
    expect(output).toContain('  "author": AuthorEntry;');
    expect(output).toContain('  "blogPost": BlogPostEntry;');
    expect(output).toContain("export const ContentfulEntrySchemaByContentType = {");
    expect(output).toContain('  "author": AuthorEntrySchema,');
    expect(output).toContain('  "blogPost": BlogPostEntrySchema,');
    expect(output).toContain(
      "} as const satisfies {\n  [K in ContentfulContentTypeId]: z.ZodType<ContentfulEntryByContentType[K]>;"
    );
  });

  it("throws when there are no content types", () => {
    expect(() => emitContentTypeIdPrimitives([], { includeEntryMaps: false })).toThrow(
      "At least one content type is required"
    );
  });
});
