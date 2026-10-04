import { describe, expect, it } from "vitest";

import { checkProgram } from "../check";
import { resolveTypeExpr } from "../check/resolve-type";
import { createDiagnosticSink } from "../check/diagnostic";
import { collectResources, collectScalars } from "../check/collect";
import { parseAndCheck } from "../compile/parse-and-check";
import { pageDetailProgram } from "../fixtures";
import {
  defScalar,
  field,
  objectType,
  prim,
  resource,
  resourceRef,
  scalarRef,
  span,
  strLit,
  typeProj,
  union,
} from "../fixtures/ir-builders";
import type { Program } from "../ir";

function resolveIn(program: Program, type: Program["resources"][0]["payloadType"]) {
  const sink = createDiagnosticSink();
  const scalars = collectScalars(program, sink);
  const resources = collectResources(program, scalars, sink);
  const resolved = resolveTypeExpr(type, "test", scalars, resources, sink);
  return { resolved, diagnostics: sink.diagnostics };
}

describe("type projection Resource.field", () => {
  it("projects a nominal scalar field", () => {
    const program: Program = {
      span,
      scalars: [defScalar("Sku", "string"), defScalar("ProductId", "string")],
      opaques: [],
      resources: [
        resource(
          "Product",
          [field("id", scalarRef("ProductId"))],
          objectType(field("id", scalarRef("ProductId"), true), field("sku", scalarRef("Sku")))
        ),
      ],
      fragments: [],
      datasources: [],
      queries: [],
    };

    const { resolved, diagnostics } = resolveIn(program, typeProj("Product", "sku"));
    expect(diagnostics).toEqual([]);
    expect(resolved).toEqual(scalarRef("Sku"));
  });

  it("projects a string literal field", () => {
    const program: Program = {
      span,
      scalars: [defScalar("HeroId", "string")],
      opaques: [],
      resources: [
        resource(
          "Hero",
          [field("id", scalarRef("HeroId"))],
          objectType(field("type", strLit("Hero")), field("id", scalarRef("HeroId"), true))
        ),
      ],
      fragments: [],
      datasources: [],
      queries: [],
    };

    const { resolved, diagnostics } = resolveIn(program, typeProj("Hero", "type"));
    expect(diagnostics).toEqual([]);
    expect(resolved).toEqual(strLit("Hero"));
  });

  it("projects a primitive field", () => {
    const program: Program = {
      span,
      scalars: [defScalar("HeroId", "string")],
      opaques: [],
      resources: [
        resource(
          "Hero",
          [field("id", scalarRef("HeroId"))],
          objectType(field("id", scalarRef("HeroId"), true), field("title", prim("string")))
        ),
      ],
      fragments: [],
      datasources: [],
      queries: [],
    };

    const { resolved, diagnostics } = resolveIn(program, typeProj("Hero", "title"));
    expect(diagnostics).toEqual([]);
    expect(resolved).toEqual(prim("string"));
  });

  it("distributes over a resource-union payload and normalizes duplicates", () => {
    const program: Program = {
      span,
      scalars: [
        defScalar("TabsId", "string"),
        defScalar("HeroId", "string"),
        defScalar("ProductId", "string"),
        defScalar("EditorialModuleId", "string"),
      ],
      opaques: [],
      resources: [
        resource(
          "Tabs",
          [field("id", scalarRef("TabsId"))],
          objectType(field("type", strLit("Tabs")), field("id", scalarRef("TabsId"), true))
        ),
        resource(
          "Hero",
          [field("id", scalarRef("HeroId"))],
          objectType(field("type", strLit("Hero")), field("id", scalarRef("HeroId"), true))
        ),
        resource(
          "Product",
          [field("id", scalarRef("ProductId"))],
          objectType(field("type", strLit("Product")), field("id", scalarRef("ProductId"), true))
        ),
        resource(
          "EditorialModule",
          [field("id", scalarRef("EditorialModuleId"))],
          union(
            resourceRef("Tabs"),
            resourceRef("Hero"),
            resourceRef("Product"),
            resourceRef("Hero")
          )
        ),
      ],
      fragments: [],
      datasources: [],
      queries: [],
    };

    const { resolved, diagnostics } = resolveIn(program, typeProj("EditorialModule", "type"));
    expect(diagnostics).toEqual([]);
    expect(resolved).toEqual(union(strLit("Tabs"), strLit("Hero"), strLit("Product")));
  });

  it("errors on unknown payload field", () => {
    const program: Program = {
      span,
      scalars: [defScalar("HeroId", "string")],
      opaques: [],
      resources: [
        resource(
          "Hero",
          [field("id", scalarRef("HeroId"))],
          objectType(field("id", scalarRef("HeroId"), true))
        ),
      ],
      fragments: [],
      datasources: [],
      queries: [],
    };

    const { diagnostics } = resolveIn(program, typeProj("Hero", "missing"));
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "UNKNOWN_PAYLOAD_FIELD_PROJECTION",
        message: expect.stringContaining("missing"),
      })
    );
  });

  it("errors when a union member lacks the projected field", () => {
    const program: Program = {
      span,
      scalars: [
        defScalar("TabsId", "string"),
        defScalar("HeroId", "string"),
        defScalar("ProductId", "string"),
        defScalar("EditorialModuleId", "string"),
        defScalar("Sku", "string"),
      ],
      opaques: [],
      resources: [
        resource(
          "Tabs",
          [field("id", scalarRef("TabsId"))],
          objectType(field("type", strLit("Tabs")), field("id", scalarRef("TabsId"), true))
        ),
        resource(
          "Hero",
          [field("id", scalarRef("HeroId"))],
          objectType(field("type", strLit("Hero")), field("id", scalarRef("HeroId"), true))
        ),
        resource(
          "Product",
          [field("id", scalarRef("ProductId"))],
          objectType(
            field("type", strLit("Product")),
            field("id", scalarRef("ProductId"), true),
            field("sku", scalarRef("Sku"))
          )
        ),
        resource(
          "EditorialModule",
          [field("id", scalarRef("EditorialModuleId"))],
          union(resourceRef("Tabs"), resourceRef("Hero"), resourceRef("Product"))
        ),
      ],
      fragments: [],
      datasources: [],
      queries: [],
    };

    const { diagnostics } = resolveIn(program, typeProj("EditorialModule", "sku"));
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "TYPE_PROJECTION_FIELD_NOT_COMMON",
        message: expect.stringMatching(/sku.*Tabs.*Hero|sku.*Hero.*Tabs/),
      })
    );
  });

  it("works inside nested object payloads and arrays via checkProgram", () => {
    const { diagnostics } = parseAndCheck(`
      scalar Id on string;
      scalar Sku on string;

      resource Product(id: Id): {
        type: "Product"
        id
        sku: Sku
      }

      resource Box(id: Id): {
        items: {
          kind: Product.type
          sku: Product.sku
        }[]
      }
    `);

    expect(diagnostics).toEqual([]);
  });

  it("integrates CMS link strip objects in pageDetailProgram", () => {
    expect(checkProgram(pageDetailProgram())).toEqual([]);

    const page = pageDetailProgram().resources.find((r) => r.name === "Page");
    expect(page?.payloadType.kind).toBe("object");
    if (page?.payloadType.kind !== "object") return;
    const strips = page.payloadType.fields.find((f) => f.name === "strips")?.type;
    expect(strips?.kind).toBe("array");
    if (strips?.kind !== "array") return;
    expect(strips.of.kind).toBe("object");
    if (strips.of.kind !== "object") return;
    expect(strips.of.fields.map((f) => f.name)).toEqual(["id"]);
  });

  it("parses and typechecks page-detail.ziel with discriminated strip stubs", () => {
    const source = `
      scalar Locale on string;
      scalar PageId on string;
      scalar HeroId on string;
      scalar TabsId on string;
      scalar ProductId on string;

      resource Page(id: PageId, locale: Locale): {
        id
        strips: (
          { type: "Hero", id: HeroId } |
          { type: "Tabs", id: TabsId } |
          { type: "Product", id: ProductId }
        )[]
      }

      resource Hero(id: HeroId, locale: Locale): {
        type: "Hero"
        id
      }

      resource Tabs(id: TabsId, locale: Locale): {
        type: "Tabs"
        id
      }

      resource Product(id: ProductId, locale: Locale): {
        type: "Product"
        id
      }

      query Q(pageId: PageId, locale: Locale) {
        context {
    locale
  }
        root Page(id: pageId, locale: locale)
        on Page p {
          id
          expand strips: each s in p.strips (
            Hero(id: s.id, locale: locale) when s.type == "Hero",
            Tabs(id: s.id, locale: locale) when s.type == "Tabs",
            Product(id: s.id, locale: locale) when s.type == "Product"
          )
        }
        on Hero h { id }
        on Tabs t { id }
        on Product prod { id }
      }
    `;
    const { diagnostics, program } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);
    const page = program.resources.find((r) => r.name === "Page");
    expect(page?.payloadType.kind).toBe("object");
    if (page?.payloadType.kind !== "object") return;
    const strips = page.payloadType.fields.find((f) => f.name === "strips")?.type;
    expect(strips?.kind).toBe("array");
    if (strips?.kind !== "array") return;
    expect(strips.of.kind).toBe("union");
  });
});
