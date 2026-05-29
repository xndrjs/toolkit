import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { ContentField } from "../model/content-type";
import { loadFixtureContentTypes } from "../test/fixtures";
import { buildLocaleCodeSchema } from "./locale-primitives";
import { fieldToZod, wrapForDelivery } from "./field-to-zod";
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

describe("wrapForDelivery", () => {
  it("wraps localized fields in a locale record schema", () => {
    const title = fieldById("title");
    const flat = fieldToZod(title, { contentTypeId: blogPost!.id });
    const delivery = wrapForDelivery(flat, title, localeCodeSchema);

    expect(zodToSource(delivery.schema)).toBe(
      'z.record(z.enum(["en-US", "it-IT"]), z.string().max(256))'
    );
  });

  it("wraps optional localized fields as optional locale records", () => {
    const excerpt = fieldById("excerpt");
    const flat = fieldToZod(excerpt, { contentTypeId: blogPost!.id });
    const delivery = wrapForDelivery(flat, excerpt, localeCodeSchema);

    expect(zodToSource(delivery.schema)).toBe(
      'z.record(z.enum(["en-US", "it-IT"]), z.string()).optional()'
    );
  });

  it("leaves non-localized fields unchanged", () => {
    const slug = fieldById("slug");
    const flat = fieldToZod(slug, { contentTypeId: blogPost!.id });
    const delivery = wrapForDelivery(flat, slug, localeCodeSchema);

    expect(delivery.schema).toBe(flat.schema);
    expect(zodToSource(delivery.schema)).toBe("z.string()");
  });

  it("parses delivery-shaped localized values and flat values alike", () => {
    const title = fieldById("title");
    const flat = fieldToZod(title, { contentTypeId: blogPost!.id });
    const delivery = wrapForDelivery(flat, title, localeCodeSchema);

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

    expect(slugDelivery.schema.parse("my-post")).toBe("my-post");
  });
});
