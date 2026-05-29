import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { ContentField } from "../model/content-type";
import { loadFixtureContentTypes } from "../test/fixtures";
import { buildLocaleCodeSchema } from "./locale-primitives";
import { fieldToZod, flatFieldSource, wrapForDelivery } from "./field-to-zod";
import { zodToSource } from "./zod-to-source";

const [blogPost] = loadFixtureContentTypes();
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

    expect(flatFieldSource(flat, title)).toBe("z.string().max(256).nullable()");

    const excerpt = fieldById("excerpt");
    const excerptFlat = fieldToZod(excerpt, { contentTypeId: blogPost!.id });
    expect(flatFieldSource(excerptFlat, excerpt)).toBe("z.string().nullable().optional()");
  });
});

describe("wrapForDelivery", () => {
  it("wraps localized fields in a nullable locale record schema", () => {
    const title = fieldById("title");
    const flat = fieldToZod(title, { contentTypeId: blogPost!.id });
    const delivery = wrapForDelivery(flat, title, localeCodeSchema);

    expect(zodToSource(delivery.schema)).toBe(
      'z.record(z.enum(["en-US", "it-IT"]), z.string().max(256)).nullable()'
    );
  });

  it("wraps optional localized fields as nullable optional locale records", () => {
    const excerpt = fieldById("excerpt");
    const flat = fieldToZod(excerpt, { contentTypeId: blogPost!.id });
    const delivery = wrapForDelivery(flat, excerpt, localeCodeSchema);

    expect(zodToSource(delivery.schema)).toBe(
      'z.record(z.enum(["en-US", "it-IT"]), z.string()).nullable().optional()'
    );
  });

  it("makes non-localized fields nullable", () => {
    const slug = fieldById("slug");
    const flat = fieldToZod(slug, { contentTypeId: blogPost!.id });
    const delivery = wrapForDelivery(flat, slug, localeCodeSchema);

    expect(zodToSource(delivery.schema)).toBe("z.string().nullable()");
  });

  it("makes optional non-localized fields nullable and optional", () => {
    const author = fieldById("author");
    const flat = fieldToZod(author, { contentTypeId: blogPost!.id });
    const delivery = wrapForDelivery(flat, author, localeCodeSchema);

    expect(zodToSource(delivery.schema)).toContain(".nullable().optional()");
  });

  it("parses null delivery values and localized records", () => {
    const title = fieldById("title");
    const flat = fieldToZod(title, { contentTypeId: blogPost!.id });
    const delivery = wrapForDelivery(flat, title, localeCodeSchema);

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
    const slugDelivery = wrapForDelivery(slugFlat, slug, localeCodeSchema);

    expect(slugDelivery.schema.parse(null)).toBeNull();
    expect(slugDelivery.schema.parse("my-post")).toBe("my-post");
  });
});
