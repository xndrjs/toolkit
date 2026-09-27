/**
 * Parse → lower IR for `datasource` declarations.
 */
import { describe, expect, it } from "vitest";

import { isModel, type Model } from "../../lang/generated/ast";
import { createZielServices } from "../../lang/ziel-module";
import { lowerProgram } from "./program";

function parseSource(source: string): Model {
  const { Ziel } = createZielServices();
  const result = Ziel.parser.LangiumParser.parse(source);
  expect(result.parserErrors, JSON.stringify(result.parserErrors)).toEqual([]);
  expect(result.lexerErrors, JSON.stringify(result.lexerErrors)).toEqual([]);
  expect(isModel(result.value)).toBe(true);
  return result.value as Model;
}

const prelude = `
  scalar Locale on string;
  scalar EntryId on string;
  scalar AssetId on string;

  resource Entry(id: EntryId, locale: Locale): {
    id
    type: string
    locale
  }

  resource Asset(id: AssetId, locale: Locale): {
    id
    locale
  }
`;

describe("lowerDatasources", () => {
  it("lowers context fields, bindings, and identity when into DatasourceDefinition IR", () => {
    const program = lowerProgram(
      parseSource(`
        ${prelude}

        datasource CmsSource {
          context { locale: Locale }
          for Entry e when context.locale == @e.locale
          for Asset
        }
      `)
    );

    expect(program.datasources).toHaveLength(1);
    const ds = program.datasources[0]!;
    expect(ds.name).toBe("CmsSource");
    expect(ds.span).toEqual(
      expect.objectContaining({
        start: expect.any(Number),
        end: expect.any(Number),
      })
    );
    expect(ds.contextFields).toMatchObject([
      {
        name: "locale",
        type: { kind: "scalarRef", name: "Locale" },
      },
    ]);
    expect(ds.routes).toHaveLength(2);
    expect(ds.routes[0]).toMatchObject({
      resource: "Entry",
      alias: "e",
      when: {
        kind: "binary",
        op: "==",
        left: { kind: "context", path: ["locale"] },
        right: { kind: "identityRef", binding: "e", path: ["locale"] },
      },
    });
    expect(ds.routes[1]).toMatchObject({
      resource: "Asset",
      alias: null,
      when: null,
    });
  });

  it("classifies bare binding paths in when as payloadRef (checker rejects later)", () => {
    const program = lowerProgram(
      parseSource(`
        ${prelude}

        datasource CmsSource {
          for Entry e when e.type == "Hero"
          for Asset a
        }
      `)
    );

    expect(program.datasources[0]!.routes[0]!.when).toMatchObject({
      kind: "binary",
      op: "==",
      left: { kind: "payloadRef", binding: "e", path: ["type"] },
      right: { kind: "literal", value: "Hero" },
    });
  });

  it("lowers multiple datasources covering overlapping resources", () => {
    const program = lowerProgram(
      parseSource(`
        ${prelude}

        datasource CmsSource {
          context { locale: Locale }
          for Entry e when context.locale == @e.locale
          for Asset a
        }

        datasource MirrorSource {
          for Entry
        }
      `)
    );

    expect(program.datasources.map((d) => d.name)).toEqual(["CmsSource", "MirrorSource"]);
    expect(program.datasources[0]!.routes.map((r) => r.resource)).toEqual(["Entry", "Asset"]);
    expect(program.datasources[1]!.routes).toMatchObject([
      { resource: "Entry", alias: null, when: null },
    ]);
  });

  it("omits contextFields when context block is absent", () => {
    const program = lowerProgram(
      parseSource(`
        ${prelude}

        datasource CmsSource {
          for Entry
          for Asset
        }
      `)
    );

    expect(program.datasources[0]!.contextFields).toEqual([]);
  });
});
