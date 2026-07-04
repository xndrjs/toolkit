import { describe, expect, it } from "vitest";

import { loadFixtureContentTypes, loadFixtureLocales } from "../test/fixtures";
import { importGeneratedModule } from "../test/import-generated";
import { generateZodSchemas } from "./generate-file";

const contentTypes = loadFixtureContentTypes();
const locales = loadFixtureLocales();

interface GeneratedLinkParse {
  getAllowedEntryLinkContentTypes: (ctype: "blogPost", fieldName: "author") => readonly ["author"];
  parseEntryAsLinkField: (
    ctype: "blogPost",
    fieldName: "author",
    entry: unknown
  ) => { sys: { id: string; contentType: { sys: { id: string } } }; fields: unknown };
  LinkFieldTargetError: new (
    parent: string,
    field: string,
    resolved: string,
    allowed: readonly string[]
  ) => Error;
  AuthorEntrySchema: { parse: (value: unknown) => unknown };
}

async function loadGenerated() {
  const source = generateZodSchemas(contentTypes, { locales, localeMode: "both" });
  expect(source).toContain("export function parseEntryAsLinkField");
  return importGeneratedModule<GeneratedLinkParse>(source);
}

describe("parseEntryAsLinkField", () => {
  const resolvedAuthorEntry = {
    sys: {
      id: "author-1",
      type: "Entry",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      revision: 1,
      contentType: {
        sys: { type: "Link", linkType: "ContentType", id: "author" },
      },
      space: { sys: { type: "Link", linkType: "Space", id: "space" } },
      environment: { sys: { type: "Link", linkType: "Environment", id: "master" } },
    },
    fields: {
      name: "Jane",
    },
  };

  it("getAllowedEntryLinkContentTypes returns linkContentType targets from CMA", async () => {
    const { getAllowedEntryLinkContentTypes } = await loadGenerated();

    expect(getAllowedEntryLinkContentTypes("blogPost", "author")).toEqual(["author"]);
  });

  it("parses a resolved entry when content type matches linkContentType", async () => {
    const mod = await loadGenerated();
    const parsed = mod.parseEntryAsLinkField("blogPost", "author", resolvedAuthorEntry);

    expect(parsed.sys.contentType.sys.id).toBe("author");
    expect(mod.AuthorEntrySchema.parse(parsed)).toEqual(parsed);
  });

  it("throws LinkFieldTargetError when resolved content type is not allowed", async () => {
    const mod = await loadGenerated();

    expect(() =>
      mod.parseEntryAsLinkField("blogPost", "author", {
        ...resolvedAuthorEntry,
        sys: {
          ...resolvedAuthorEntry.sys,
          contentType: {
            sys: { type: "Link", linkType: "ContentType", id: "blogPost" },
          },
        },
      })
    ).toThrow(mod.LinkFieldTargetError);
  });
});
