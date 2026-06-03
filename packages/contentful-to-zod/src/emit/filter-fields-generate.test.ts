import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { ContentType } from "../model/content-type";
import { generateZodSchemas } from "./generate-file";

const locales = [{ code: "en-US", default: true }];

const blogPostWithBlueprintFields: ContentType = {
  id: "blogPost",
  name: "Blog Post",
  fields: [
    {
      id: "title",
      name: "Title",
      type: "Symbol",
      required: true,
      localized: false,
    },
    {
      id: "legacySlug",
      name: "Legacy slug",
      type: "Symbol",
      required: false,
      localized: false,
      omitted: true,
    },
    {
      id: "deprecatedNote",
      name: "Deprecated note",
      type: "Text",
      required: false,
      localized: false,
      disabled: true,
    },
    {
      id: "removedField",
      name: "Removed",
      type: "Symbol",
      required: false,
      localized: false,
      deleted: true,
    },
    {
      id: "metadata",
      name: "Metadata",
      type: "Object",
      required: false,
      localized: false,
      omitted: true,
    },
  ],
};

describe("generateZodSchemas blueprint field filtering", () => {
  it("omits disabled, omitted, and deleted fields from output by default", () => {
    const output = generateZodSchemas([blogPostWithBlueprintFields], {
      locales,
      localeMode: "both",
    });

    expect(output).toContain('"title":');
    expect(output).not.toContain('"legacySlug":');
    expect(output).not.toContain('"deprecatedNote":');
    expect(output).not.toContain('"removedField":');
    expect(output).not.toContain("legacySlug");
    expect(output).not.toContain("deprecatedNote");
    expect(output).not.toContain("removedField");
  });

  it("includes blueprint fields when config flags are enabled", () => {
    const output = generateZodSchemas([blogPostWithBlueprintFields], {
      locales,
      localeMode: "both",
      config: {
        fields: {
          includeOmitted: true,
          includeDisabled: true,
          includeDeleted: true,
        },
        objects: {
          "blogPost.metadata": z.object({ seoTitle: z.string() }),
        },
      },
    });

    expect(output).toContain('"legacySlug":');
    expect(output).toContain('"deprecatedNote":');
    expect(output).toContain('"removedField":');
    expect(output).toContain('"legacySlug": fields.legacySlug ?? null');
  });
});
