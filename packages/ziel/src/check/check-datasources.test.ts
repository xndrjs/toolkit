import { describe, expect, it } from "vitest";

import { parseAndCheck } from "../compile/parse-and-check";
import { eq, item, lit, payload } from "../fixtures";
import { checkProgram } from "./check-program";

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

const coveredQuery = `
  query Q(id: EntryId) {
    context { locale: Locale }
    root Entry(id: id, locale: context.locale)
    on Entry e { id type }
    on Asset a { id }
  }
`;

describe("checkDatasources", () => {
  it("lowers and typechecks context + identity when", () => {
    const { diagnostics, program } = parseAndCheck(`
      ${prelude}

      datasource CmsSource {
        context { locale: Locale }
        for Entry e when context.locale == @e.locale
        for Asset a
      }

      ${coveredQuery}
    `);

    expect(diagnostics).toEqual([]);
    expect(program.datasources).toHaveLength(1);
    const ds = program.datasources[0]!;
    expect(ds.name).toBe("CmsSource");
    expect(ds.contextFields.map((f) => f.name)).toEqual(["locale"]);
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
      alias: "a",
      when: null,
    });
  });

  it("rejects payload access in datasource when", () => {
    const { diagnostics } = parseAndCheck(`
      ${prelude}

      datasource CmsSource {
        for Entry e when e.type == "Hero"
        for Asset
      }

      ${coveredQuery}
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "DATASOURCE_PAYLOAD_ACCESS",
        message: expect.stringContaining("Payload access `e.type`"),
      })
    );
  });

  it("requires a binding when datasource when is present", () => {
    const { diagnostics } = parseAndCheck(`
      ${prelude}

      datasource CmsSource {
        for Entry when true
        for Asset
      }

      ${coveredQuery}
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "DATASOURCE_WHEN_REQUIRES_BINDING",
        message: expect.stringContaining("Entry"),
      })
    );
  });

  it("rejects unknown datasource resources", () => {
    const { diagnostics } = parseAndCheck(`
      ${prelude}

      datasource CmsSource {
        for Missing
        for Entry
        for Asset
      }

      ${coveredQuery}
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "UNKNOWN_DATASOURCE_RESOURCE",
        message: expect.stringContaining("Missing"),
      })
    );
  });

  it("rejects duplicate datasource names and routes", () => {
    const { diagnostics } = parseAndCheck(`
      ${prelude}

      datasource CmsSource {
        for Entry
        for Entry
        for Asset
      }

      datasource CmsSource {
        for Entry
        for Asset
      }

      ${coveredQuery}
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: "DUPLICATE_DATASOURCE_ROUTE" })
    );
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: "DUPLICATE_DATASOURCE" }));
  });

  it("rejects duplicate datasource context fields", () => {
    const { diagnostics } = parseAndCheck(`
      ${prelude}

      datasource CmsSource {
        context {
          locale: Locale
          locale: Locale
        }
        for Entry
        for Asset
      }

      ${coveredQuery}
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: "DUPLICATE_DATASOURCE_CONTEXT_FIELD" })
    );
  });

  it("rejects incompatible merged execution-context fields", () => {
    const { diagnostics } = parseAndCheck(`
      ${prelude}

      datasource CmsSource {
        context { locale: Locale }
        for Entry
      }

      datasource AssetSource {
        context { locale: string }
        for Asset
      }

      ${coveredQuery}
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "INCOMPATIBLE_EXECUTION_CONTEXT_FIELD",
        message: expect.stringContaining("locale"),
      })
    );
  });

  it("reports resources with no datasource route when datasources exist", () => {
    const { diagnostics } = parseAndCheck(`
      ${prelude}

      datasource CmsSource {
        for Entry
      }

      ${coveredQuery}
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "RESOURCE_MISSING_DATASOURCE",
        message: expect.stringContaining("Asset"),
      })
    );
  });

  it("does not require coverage when no datasources are declared", () => {
    const { diagnostics } = parseAndCheck(`
      ${prelude}
      ${coveredQuery}
    `);

    expect(diagnostics.filter((d) => d.code === "RESOURCE_MISSING_DATASOURCE")).toEqual([]);
  });

  it("requires query context to include aggregate datasource fields", () => {
    const { diagnostics } = parseAndCheck(`
      ${prelude}

      datasource CmsSource {
        context { locale: Locale }
        for Entry
        for Asset
      }

      query Q(id: EntryId) {
        context { }
        root Entry(id: id, locale: "en")
        on Entry e { id type }
        on Asset a { id }
      }
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "QUERY_CONTEXT_MISSING_DATASOURCE_FIELD",
        message: expect.stringContaining("locale"),
      })
    );
  });

  it("allows multiple datasources covering the same resource", () => {
    const { diagnostics } = parseAndCheck(`
      ${prelude}

      datasource CmsSource {
        context { locale: Locale }
        for Entry e when context.locale == @e.locale
        for Asset
      }

      datasource MirrorSource {
        context { locale: Locale }
        for Entry
      }

      ${coveredQuery}
    `);

    expect(diagnostics).toEqual([]);
  });

  it("rejects non-boolean datasource when", () => {
    const { diagnostics } = parseAndCheck(`
      ${prelude}

      datasource CmsSource {
        context { locale: Locale }
        for Entry e when context.locale
        for Asset
      }

      ${coveredQuery}
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "TYPE_MISMATCH",
        message: expect.stringContaining("boolean"),
      })
    );
  });

  it("rejects query context fields incompatible with aggregate datasource types", () => {
    const { diagnostics } = parseAndCheck(`
      ${prelude}

      datasource CmsSource {
        context { locale: Locale }
        for Entry
        for Asset
      }

      query Q(id: EntryId) {
        context { locale: string }
        root Entry(id: id, locale: "en")
        on Entry e { id type }
        on Asset a { id }
      }
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "QUERY_CONTEXT_MISSING_DATASOURCE_FIELD",
        message: expect.stringMatching(/locale.*incompatible/i),
      })
    );
  });

  it("rejects param references in datasource when via IR", () => {
    const { program, diagnostics: parseDiags } = parseAndCheck(`
      ${prelude}

      datasource CmsSource {
        context { locale: Locale }
        for Entry e when context.locale == @e.locale
        for Asset
      }

      ${coveredQuery}
    `);
    expect(parseDiags).toEqual([]);

    program.datasources[0]!.routes[0]!.when = {
      kind: "param",
      name: "id",
      span: null,
    };

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "DATASOURCE_INVALID_EXPR" })
    );
  });

  it("rejects itemRef planted in IR", () => {
    const { program, diagnostics: parseDiags } = parseAndCheck(`
      ${prelude}

      datasource CmsSource {
        context { locale: Locale }
        for Entry e when context.locale == @e.locale
        for Asset
      }

      ${coveredQuery}
    `);
    expect(parseDiags).toEqual([]);

    program.datasources[0]!.routes[0]!.when = item("link", "id");

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({
        code: "DATASOURCE_INVALID_EXPR",
        message: expect.stringContaining("comprehension item"),
      })
    );
  });

  it("rejects payloadRef planted in IR with the spec message", () => {
    const { program, diagnostics: parseDiags } = parseAndCheck(`
      ${prelude}

      datasource CmsSource {
        context { locale: Locale }
        for Entry e when context.locale == @e.locale
        for Asset
      }

      ${coveredQuery}
    `);
    expect(parseDiags).toEqual([]);

    program.datasources[0]!.routes[0]!.when = eq(payload("e", "type"), lit("Hero"));

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({
        code: "DATASOURCE_PAYLOAD_ACCESS",
        message:
          "Datasource predicates run before resource loading. Payload access `e.type` is not available here; use identity fields through `@e`.",
      })
    );
  });
});
