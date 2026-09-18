import { describe, expect, it } from "vitest";

import type { ContentField } from "../model/content-type";
import { loadFixtureContentTypes } from "../test/fixtures";
import { collectFieldEnums, fieldEnumDescriptorMap } from "./field-enum-primitives";
import { buildLocaleCodeSchema } from "./locale-primitives";
import {
  fieldToZod,
  localizedFieldSource,
  flatFieldSource,
  wrapForLocalized,
} from "./field-to-zod";

const blogPost = loadFixtureContentTypes().find((ct) => ct.id === "blogPost")!;
const fieldEnums = fieldEnumDescriptorMap(collectFieldEnums([blogPost!]));
const localeCodeSchema = buildLocaleCodeSchema([
  { code: "en-US", default: true },
  { code: "it-IT", default: false },
]);

function fieldById(id: string): ContentField {
  const field = blogPost!.fields.find((candidate) => candidate.id === id);
  if (!field) {
    throw new Error(`Field "${id}" not found in fixture.`);
  }
  return field;
}

function fieldToZodWithEnums(field: ContentField) {
  return fieldToZod(field, { contentTypeId: blogPost!.id, fieldEnums });
}

describe("flatFieldSource", () => {
  it("emits nullable flat schemas for pickLocale / flatten compatibility", () => {
    const title = fieldById("title");
    const flat = fieldToZodWithEnums(title);

    expect(flatFieldSource(flat, title)).toBe("flatField(z.string().max(256))");

    const excerpt = fieldById("excerpt");
    const excerptFlat = fieldToZodWithEnums(excerpt);
    expect(flatFieldSource(excerptFlat, excerpt)).toBe("flatField(z.string())");
  });

  it("references named field enums from validations.in", () => {
    const status = fieldById("status");
    const statusFlat = fieldToZodWithEnums(status);
    expect(statusFlat.sourceRef).toBe("BlogPostStatusSchema");
    expect(flatFieldSource(statusFlat, status)).toBe("flatField(BlogPostStatusSchema)");

    const priority = fieldById("priority");
    const priorityFlat = fieldToZodWithEnums(priority);
    expect(flatFieldSource(priorityFlat, priority)).toBe("flatField(BlogPostPrioritySchema)");

    const tags = fieldById("tags");
    const tagsFlat = fieldToZodWithEnums(tags);
    expect(flatFieldSource(tagsFlat, tags)).toBe("flatField(z.array(BlogPostTagsSchema).max(5))");
  });
});

describe("localizedFieldSource", () => {
  it("wraps localized fields in transportField with a locale record", () => {
    const title = fieldById("title");
    const flat = fieldToZodWithEnums(title);

    expect(localizedFieldSource(flat, title)).toBe(
      "transportField(z.record(ContentfulLocaleCodeSchema, z.string().max(256)))"
    );
  });

  it("wraps optional localized fields with transportField", () => {
    const excerpt = fieldById("excerpt");
    const flat = fieldToZodWithEnums(excerpt);

    expect(localizedFieldSource(flat, excerpt)).toBe(
      "transportField(z.record(ContentfulLocaleCodeSchema, z.string()))"
    );
  });

  it("wraps non-localized fields with transportField", () => {
    const slug = fieldById("slug");
    const flat = fieldToZodWithEnums(slug);

    expect(localizedFieldSource(flat, slug)).toBe("transportField(z.string())");
  });

  it("references named field enums in localized shapes", () => {
    const status = fieldById("status");
    const flat = fieldToZodWithEnums(status);

    expect(localizedFieldSource(flat, status)).toBe("transportField(BlogPostStatusSchema)");
  });

  it("wraps optional non-localized fields with transportField", () => {
    const author = fieldById("author");
    const flat = fieldToZodWithEnums(author);

    expect(localizedFieldSource(flat, author)).toContain("transportField(");
  });
});

describe("wrapForLocalized", () => {
  it("parses absent, null, and present delivery values", () => {
    const title = fieldById("title");
    const flat = fieldToZodWithEnums(title);
    const delivery = wrapForLocalized(flat, title, localeCodeSchema);

    expect(delivery.schema.parse(undefined)).toBeNull();
    expect(delivery.schema.parse(null)).toBeNull();
    expect(
      delivery.schema.parse({
        "en-US": "Hello",
        "it-IT": "Ciao",
      })
    ).toEqual({
      "en-US": "Hello",
      "it-IT": "Ciao",
    });

    const slug = fieldById("slug");
    const slugFlat = fieldToZodWithEnums(slug);
    const slugDelivery = wrapForLocalized(slugFlat, slug, localeCodeSchema);

    expect(slugDelivery.schema.parse(undefined)).toBeNull();
    expect(slugDelivery.schema.parse(null)).toBeNull();
    expect(slugDelivery.schema.parse("my-post")).toBe("my-post");
  });
});
