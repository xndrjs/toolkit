/**
 * Multi-file compose: resources.ts + kebab.query.ts + index.ts.
 */
import { describe, expect, it } from "vitest";

import { analyzeProgram } from "../../check";
import { parseAndCheck } from "../parse-and-check";
import {
  composeGeneratedModules,
  GENERATED_MODULE_HEADER,
  isManagedGeneratedOutput,
} from "./compose-generated-module";
import { generateResources } from "./generators/generate-resources";

function checked(source: string) {
  const result = parseAndCheck(source);
  expect(result.diagnostics).toEqual([]);
  return result.program;
}

describe("composeGeneratedModules", () => {
  it("emits resources.ts + index.ts when there are no queries", () => {
    const program = checked(`
      scalar Id on string;
      resource Post(id: Id): { id title: string }
    `);

    const { files } = composeGeneratedModules(program);
    expect(files.map((f) => f.relativePath)).toEqual(["resources.ts", "index.ts"]);

    const resources = files.find((f) => f.relativePath === "resources.ts")!;
    expect(resources.code).toBe(generateResources(program).code);

    const index = files.find((f) => f.relativePath === "index.ts")!;
    expect(index.code).toContain('export * from "./resources";');
    expect(index.code).not.toContain(".query");
  });

  it("splits queries into kebab-case .query.ts files with per-query imports", () => {
    const program = checked(`
      scalar Locale on string;
      scalar EntryId on string;
      scalar AssetId on string;
      scalar Sku on string;

      resource Entry(id: EntryId, locale: Locale): {
        id
        type: string
        locale
      }
      resource Asset(id: AssetId, locale: Locale): {
        id
        locale
      }
      resource Product(sku: Sku, locale: Locale): {
        sku
        locale
        title: string
      }

      datasource CmsSource {
        context { locale: Locale }
        for Entry
        for Asset
      }

      datasource CatalogApi {
        context { locale: Locale }
        for Product
      }

      query PageDetail(id: EntryId, locale: Locale) {
        context { locale }
        root Entry(id: id, locale: locale)
        on Entry e { id type }
        on Asset a { id }
      }

      query ProductDetail(sku: Sku, locale: Locale) {
        context { locale }
        root Product(sku: sku, locale: locale)
        on Product p { sku title }
      }
    `);

    const { files } = composeGeneratedModules(analyzeProgram(program));
    expect(files.map((f) => f.relativePath)).toEqual([
      "resources.ts",
      "page-detail.query.ts",
      "product-detail.query.ts",
      "index.ts",
    ]);

    const resources = files.find((f) => f.relativePath === "resources.ts")!;
    expect(resources.code).toContain("export type ContentRegistry");
    expect(resources.code).toContain("export type CmsSourceConfig");
    expect(resources.code).toContain("export type CatalogApiConfig");
    expect(resources.code).toContain("type ResourceLoadContext");
    expect(resources.code).not.toContain("defineDataSourceFor");
    expect(resources.code).not.toContain("createPageDetailStrategy");

    const page = files.find((f) => f.relativePath === "page-detail.query.ts")!;
    expect(page.code).toContain("export function createPageDetailStrategy");
    expect(page.code).toContain("export function createPageDetailDataSources");
    expect(page.code).toContain("export function projectPageDetail");
    expect(page.code).toContain("export async function resolvePageDetail");
    expect(page.code).toContain("CmsSource: CmsSourceConfig");
    expect(page.code).not.toContain("CatalogApi");
    expect(page.code).not.toContain("createProductDetail");
    expect(page.code).not.toMatch(/^(?:export )?type CmsSourceConfig\b/m);
    expect(page.code).toMatch(
      /import \{[^}]*createGraphResolutionStrategy[^}]*\} from "@xndrjs\/ziel"/
    );
    expect(page.code).toMatch(/import \{[^}]*defineDataSourceFor[^}]*\} from "@xndrjs\/ziel"/);
    expect(page.code).toMatch(/import \{[^}]*type CmsSourceConfig[^}]*\} from "\.\/resources"/);
    expect(page.code).toContain("entryAri");
    expect(page.code).toContain("type ContentRegistry");

    const product = files.find((f) => f.relativePath === "product-detail.query.ts")!;
    expect(product.code).toContain("CatalogApi: CatalogApiConfig");
    expect(product.code).not.toContain("CmsSource");
    expect(product.code).not.toContain("createPageDetail");
    expect(product.code).not.toMatch(/^(?:export )?type CatalogApiConfig\b/m);
    expect(product.code).toMatch(/import \{[^}]*type CatalogApiConfig[^}]*\} from "\.\/resources"/);

    const index = files.find((f) => f.relativePath === "index.ts")!;
    expect(index.code).toContain('export * from "./resources";');
    expect(index.code).toContain('export * from "./page-detail.query";');
    expect(index.code).toContain('export * from "./product-detail.query";');
  });

  it("keeps resources body aligned with the former resources slice when queries exist", () => {
    const program = checked(`
      scalar PostId on string;
      resource Post(id: PostId): { id title: string }
      query PostDetail(id: PostId) {
        context { }
        root Post(id: id)
        on Post p { id title }
      }
    `);

    const { files } = composeGeneratedModules(program);
    const resources = files.find((f) => f.relativePath === "resources.ts")!;
    const expected = generateResources(program).code;

    // Same header + runtime import + resources body (no datasource types here).
    expect(resources.code).toBe(expected);
  });

  it("rejects query filename collisions", () => {
    // IR names are distinct but kebab-slug to the same path.
    const program = checked(`
      scalar Id on string;
      resource Post(id: Id): { id }
      query PageDetail(id: Id) {
        context { }
        root Post(id: id)
        on Post p { id }
      }
      query pageDetail(id: Id) {
        context { }
        root Post(id: id)
        on Post p { id }
      }
    `);

    expect(() => composeGeneratedModules(program)).toThrow(/Query module filename collision/);
  });

  it("recognizes managed flat outputs only when the generated header is present", () => {
    const withHeader = `${GENERATED_MODULE_HEADER}\nexport const x;\n`;
    expect(isManagedGeneratedOutput("resources.ts", withHeader)).toBe(true);
    expect(isManagedGeneratedOutput("index.ts", withHeader)).toBe(true);
    expect(isManagedGeneratedOutput("page-detail.query.ts", withHeader)).toBe(true);
    expect(isManagedGeneratedOutput("resources.ts", "export const x;\n")).toBe(false);
    expect(isManagedGeneratedOutput("hand.ts", withHeader)).toBe(false);
    expect(isManagedGeneratedOutput("nested/resources.ts", withHeader)).toBe(false);
  });
});
