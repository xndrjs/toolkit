import { describe, expect, it } from "vitest";

import type { ContentField } from "../model/content-type";
import { loadFixtureContentTypes } from "../test/fixtures";
import { buildLocaleCodeSchema } from "./locale-primitives";
import {
  fieldToZod,
  localizedFieldSource,
  flatFieldSource,
  wrapForLocalized,
} from "./field-to-zod";

const blogPost = loadFixtureContentTypes().find((ct) => ct.id === "blogPost")!;
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

describe("flatFieldSource", () => {
  it("emits nullable flat schemas for pickLocale / flatten compatibility", () => {
    const title = fieldById("title");
    const flat = fieldToZod(title, { contentTypeId: blogPost!.id });

    expect(flatFieldSource(flat, title)).toBe("flatField(z.string().max(256))");

    const excerpt = fieldById("excerpt");
    const excerptFlat = fieldToZod(excerpt, { contentTypeId: blogPost!.id });
    expect(flatFieldSource(excerptFlat, excerpt)).toBe("flatField(z.string())");
  });
});

describe("localizedFieldSource", () => {
  it("wraps localized fields in transportField with a locale record", () => {
    const title = fieldById("title");
    const flat = fieldToZod(title, { contentTypeId: blogPost!.id });

    expect(localizedFieldSource(flat, title)).toBe(
      "transportField(z.record(ContentfulLocaleCodeSchema, z.string().max(256)))"
    );
  });

  it("wraps optional localized fields with transportField", () => {
    const excerpt = fieldById("excerpt");
    const flat = fieldToZod(excerpt, { contentTypeId: blogPost!.id });

    expect(localizedFieldSource(flat, excerpt)).toBe(
      "transportField(z.record(ContentfulLocaleCodeSchema, z.string()))"
    );
  });

  it("wraps non-localized fields with transportField", () => {
    const slug = fieldById("slug");
    const flat = fieldToZod(slug, { contentTypeId: blogPost!.id });

    expect(localizedFieldSource(flat, slug)).toBe("transportField(z.string())");
  });

  it("wraps optional non-localized fields with transportField", () => {
    const author = fieldById("author");
    const flat = fieldToZod(author, { contentTypeId: blogPost!.id });

    expect(localizedFieldSource(flat, author)).toContain("transportField(");
  });
});

describe("wrapForLocalized", () => {
  it("parses absent, null, and present delivery values", () => {
    const title = fieldById("title");
    const flat = fieldToZod(title, { contentTypeId: blogPost!.id });
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
    const slugFlat = fieldToZod(slug, { contentTypeId: blogPost!.id });
    const slugDelivery = wrapForLocalized(slugFlat, slug, localeCodeSchema);

    expect(slugDelivery.schema.parse(undefined)).toBeNull();
    expect(slugDelivery.schema.parse(null)).toBeNull();
    expect(slugDelivery.schema.parse("my-post")).toBe("my-post");
  });
});
