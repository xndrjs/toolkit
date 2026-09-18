import { describe, expect, it } from "vitest";

import type { ContentType } from "../model/content-type";
import {
  collectFieldEnums,
  emitFieldEnumPrimitives,
  fieldEnumDescriptorMap,
  fieldEnumValueSource,
} from "./field-enum-primitives";
import {
  fieldEnumConstName,
  fieldEnumSchemaExportName,
  fieldEnumTypeName,
  pascalToScreamingSnake,
  pluralizeFieldId,
} from "./schema-name";

const blogPost: ContentType = {
  id: "blogPost",
  name: "Blog Post",
  fields: [
    {
      id: "status",
      name: "Status",
      type: "Symbol",
      required: true,
      localized: false,
      validations: [{ in: ["draft", "published"] }],
    },
    {
      id: "priority",
      name: "Priority",
      type: "Integer",
      required: false,
      localized: false,
      validations: [{ in: [1, 2, 3] }],
    },
    {
      id: "tags",
      name: "Tags",
      type: "Array",
      required: false,
      localized: false,
      items: {
        type: "Symbol",
        validations: [{ in: ["news", "product"] }],
      },
      validations: [{ size: { max: 5 } }],
    },
    {
      id: "title",
      name: "Title",
      type: "Symbol",
      required: true,
      localized: true,
    },
  ],
};

describe("field enum naming", () => {
  it("builds schema, type, and plural const names", () => {
    expect(fieldEnumSchemaExportName("blogPost", "status")).toBe("BlogPostStatusSchema");
    expect(fieldEnumTypeName("blogPost", "status")).toBe("BlogPostStatus");
    expect(fieldEnumConstName("blogPost", "status")).toBe("BLOG_POST_STATUSES");
    expect(fieldEnumConstName("blogPost", "tags")).toBe("BLOG_POST_TAGS");
    expect(fieldEnumConstName("blogPost", "priority")).toBe("BLOG_POST_PRIORITIES");
    expect(pascalToScreamingSnake("BlogPostStatus")).toBe("BLOG_POST_STATUS");
    expect(pluralizeFieldId("status")).toBe("statuses");
    expect(pluralizeFieldId("tags")).toBe("tags");
  });
});

describe("collectFieldEnums", () => {
  it("collects field and items validations.in without cross-field dedup", () => {
    const enums = collectFieldEnums([blogPost]);

    expect(enums).toEqual([
      {
        contentTypeId: "blogPost",
        fieldId: "status",
        values: ["draft", "published"],
        source: "field",
      },
      {
        contentTypeId: "blogPost",
        fieldId: "priority",
        values: [1, 2, 3],
        source: "field",
      },
      {
        contentTypeId: "blogPost",
        fieldId: "tags",
        values: ["news", "product"],
        source: "items",
      },
    ]);
  });
});

describe("emitFieldEnumPrimitives", () => {
  it("emits values-first string enums", () => {
    const output = emitFieldEnumPrimitives([
      {
        contentTypeId: "blogPost",
        fieldId: "status",
        values: ["draft", "published"],
        source: "field",
      },
    ]);

    expect(output).toContain('export const BLOG_POST_STATUSES = ["draft", "published"] as const;');
    expect(output).toContain("export type BlogPostStatus = (typeof BLOG_POST_STATUSES)[number];");
    expect(output).toContain("export const BlogPostStatusSchema = z.enum(BLOG_POST_STATUSES);");
    expect(output).not.toContain("z.enum([");
  });

  it("emits numeric in as const array + z.union of literals", () => {
    const output = emitFieldEnumPrimitives([
      {
        contentTypeId: "blogPost",
        fieldId: "priority",
        values: [1, 2, 3],
        source: "field",
      },
    ]);

    expect(output).toContain("export const BLOG_POST_PRIORITIES = [1, 2, 3] as const;");
    expect(output).toContain(
      "export type BlogPostPriority = (typeof BLOG_POST_PRIORITIES)[number];"
    );
    expect(output).toContain(
      "export const BlogPostPrioritySchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);"
    );
  });
});

describe("fieldEnumValueSource", () => {
  it("references the named schema for scalar fields", () => {
    const descriptor = collectFieldEnums([blogPost])[0]!;
    expect(fieldEnumValueSource(blogPost.fields[0]!, descriptor)).toBe("BlogPostStatusSchema");
  });

  it("wraps item enums in z.array with size validations", () => {
    const descriptor = collectFieldEnums([blogPost]).find((entry) => entry.fieldId === "tags")!;
    expect(fieldEnumValueSource(blogPost.fields[2]!, descriptor)).toBe(
      "z.array(BlogPostTagsSchema).max(5)"
    );
  });
});

describe("fieldEnumDescriptorMap", () => {
  it("looks up enums by contentType.fieldId", () => {
    const map = fieldEnumDescriptorMap(collectFieldEnums([blogPost]));
    expect(map.get("blogPost.status")?.values).toEqual(["draft", "published"]);
  });
});
