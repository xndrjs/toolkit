import { describe, expect, it } from "vitest";
import { z } from "zod";

import { defineConfig } from "../config/define-config";
import type { ContentType } from "../model/content-type";
import { fieldToZod, validateObjectOverrides } from "./field-to-zod";
import { generateZodSchemas } from "./generate-file";
import { zodToSource } from "./zod-to-source";

const blogPost: ContentType = {
  id: "blogPost",
  name: "Blog Post",
  fields: [
    {
      id: "title",
      name: "Title",
      type: "Symbol",
      required: true,
      localized: true,
    },
    {
      id: "metadata",
      name: "Metadata",
      type: "Object",
      required: false,
      localized: true,
    },
    {
      id: "settings",
      name: "Settings",
      type: "Object",
      required: true,
      localized: false,
    },
  ],
};

const locales = [
  { code: "en-US", default: true },
  { code: "it-IT", default: false },
];

describe("object overrides", () => {
  const config = defineConfig({
    objects: {
      "blogPost.metadata": z.object({
        seoTitle: z.string(),
        noIndex: z.boolean().optional(),
      }),
      "blogPost.settings": z.object({
        featured: z.boolean(),
      }),
    },
  });

  it("validates override keys against Object fields", () => {
    expect(() => validateObjectOverrides([blogPost], config)).not.toThrow();
    expect(() =>
      validateObjectOverrides([blogPost], {
        objects: { "blogPost.title": z.object({}) },
      })
    ).toThrow('Object override "blogPost.title" targets field "title" which is type "Symbol"');
    expect(() =>
      validateObjectOverrides([blogPost], {
        objects: { "missing.field": z.object({}) },
      })
    ).toThrow('Object override "missing.field" does not match any content type field');
  });

  it("merges overrides into flat field schemas", () => {
    const metadata = fieldToZod(blogPost.fields[1]!, {
      contentTypeId: blogPost.id,
      config,
    });

    expect(zodToSource(metadata.schema)).toBe(
      'z.object({ "seoTitle": z.string(), "noIndex": z.boolean().optional() }).optional()'
    );
  });

  it("inlines overrides in generated output and wraps localized delivery fields", () => {
    const output = generateZodSchemas([blogPost], {
      locales,
      config,
    });

    expect(output).toContain(
      '"metadata": z.object({ "seoTitle": z.string(), "noIndex": z.boolean().optional() }).optional()'
    );
    expect(output).toContain(
      '"metadata": z.record(ContentfulLocaleCodeSchema, z.object({ "seoTitle": z.string(), "noIndex": z.boolean().optional() })).optional()'
    );
    expect(output).toContain('"settings": z.object({ "featured": z.boolean() })');
    expect(output).toContain("export function flattenBlogPostFields");
  });

  it("respects locale.mode from config when localeMode option is omitted", () => {
    const cmaOnly = generateZodSchemas([blogPost], {
      config: defineConfig({ locale: { mode: "cma" }, objects: config.objects! }),
    });

    expect(cmaOnly).toContain("export const BlogPostSchema");
    expect(cmaOnly).not.toContain("BlogPostDeliverySchema");
    expect(cmaOnly).not.toContain("export function pickLocale");
  });
});
