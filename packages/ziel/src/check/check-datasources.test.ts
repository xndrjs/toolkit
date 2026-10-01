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
  query Q(id: EntryId, locale: Locale) {
    context {
      locale
    }
    root Entry(id: id, locale: locale)
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

  it("skips RESOURCE_MISSING_DATASOURCE when requireDatasourceCoverage is false", () => {
    const { program, diagnostics: parseDiags } = parseAndCheck(`
      ${prelude}

      datasource CmsSource {
        for Entry
      }

      ${coveredQuery}
    `);
    expect(parseDiags).toContainEqual(
      expect.objectContaining({ code: "RESOURCE_MISSING_DATASOURCE" })
    );

    expect(
      checkProgram(program, { requireDatasourceCoverage: false }).filter(
        (d) => d.code === "RESOURCE_MISSING_DATASOURCE"
      )
    ).toEqual([]);
  });

  it("requires query context to include fields from datasources used by the query", () => {
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
        message: expect.stringMatching(/locale.*CmsSource/),
      })
    );
  });

  it("does not require context fields from datasources the query does not use", () => {
    const { diagnostics } = parseAndCheck(`
      ${prelude}

      datasource CmsEntries {
        context { locale: Locale }
        for Entry
      }

      datasource CmsAssets {
        context {
          locale: Locale
          apiKey: string
        }
        for Asset
      }

      query Q(id: EntryId, locale: Locale) {
        context {
          locale
        }
        root Entry(id: id, locale: locale)
        on Entry e { id type }
      }
    `);

    expect(diagnostics).toEqual([]);
  });

  it("requires merged context when the query also references another datasource's resource", () => {
    const { diagnostics } = parseAndCheck(`
      ${prelude}

      datasource CmsEntries {
        context { locale: Locale }
        for Entry
      }

      datasource CmsAssets {
        context {
          locale: Locale
          apiKey: string
        }
        for Asset
      }

      query Q(id: EntryId, locale: Locale) {
        context {
          locale
        }
        root Entry(id: id, locale: locale)
        on Entry e { id type }
        on Asset a { id }
      }
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "QUERY_CONTEXT_MISSING_DATASOURCE_FIELD",
        message: expect.stringMatching(/apiKey.*CmsAssets/),
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

  it("rejects query context fields incompatible with used datasource types", () => {
    const { diagnostics } = parseAndCheck(`
      ${prelude}

      datasource CmsSource {
        context { locale: Locale }
        for Entry
        for Asset
      }

      query Q(id: EntryId, locale: string) {
        context {
          locale
        }
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

  it("rejects comparing distinct scalars without as", () => {
    const { diagnostics } = parseAndCheck(`
      scalar Locale on string;
      scalar Ref on string;
      scalar EntryId on string;
      resource CustomReference(ref: Ref): { ref }
      resource Entry(id: EntryId): { id }

      datasource Cms {
        context { locale: Locale }
        for CustomReference c when context.locale == @c.ref
        for Entry
      }

      query Q(id: EntryId, locale: Locale) {
        context {
          locale
        }
        root Entry(id: id)
        on Entry e { id }
        on CustomReference c { ref }
      }
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "INCOMPATIBLE_COMPARISON",
        message: expect.stringMatching(/Locale.*Ref|Ref.*Locale/),
      })
    );
  });

  it("accepts distinct scalars erased to the same primitive", () => {
    const { diagnostics, program } = parseAndCheck(`
      scalar Locale on string;
      scalar Ref on string;
      scalar EntryId on string;
      resource CustomReference(ref: Ref): { ref }
      resource Entry(id: EntryId): { id }

      datasource Cms {
        context { locale: Locale }
        for CustomReference c when context.locale as string == @c.ref as string
        for Entry
      }

      query Q(id: EntryId, locale: Locale) {
        context {
          locale
        }
        root Entry(id: id)
        on Entry e { id }
        on CustomReference c { ref }
      }
    `);

    expect(diagnostics).toEqual([]);
    expect(program.datasources[0]!.routes[0]!.when).toEqual(
      expect.objectContaining({
        kind: "binary",
        op: "==",
        left: expect.objectContaining({ kind: "cast", type: "string" }),
        right: expect.objectContaining({ kind: "cast", type: "string" }),
      })
    );
  });

  it("rejects casting a scalar to the wrong representation", () => {
    const { diagnostics } = parseAndCheck(`
      scalar Locale on string;
      scalar EntryId on string;
      resource Entry(id: EntryId, locale: Locale): { id locale }

      datasource Cms {
        context { locale: Locale }
        for Entry e when context.locale as number == 1
      }

      query Q(id: EntryId, locale: Locale) {
        context {
          locale
        }
        root Entry(id: id, locale: locale)
        on Entry e { id }
      }
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "INVALID_CAST",
        message: expect.stringMatching(/Locale.*number/),
      })
    );
  });

  it("warns on query context fields unused by any datasource the query uses", () => {
    const { diagnostics } = parseAndCheck(`
      ${prelude}

      datasource CmsSource {
        context { locale: Locale }
        for Entry
        for Asset
      }

      query Q(id: EntryId, locale: Locale, unused: string) {
        context {
          locale
          unused
        }
        root Entry(id: id, locale: locale)
        on Entry e { id type }
        on Asset a { id }
      }
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "QUERY_CONTEXT_UNUSED_FIELD",
        severity: "warning",
        message: expect.stringMatching(/unused/),
      })
    );
    expect(diagnostics.filter((d) => d.severity !== "warning")).toEqual([]);
  });

  it("accepts context aliases that map params onto datasource field names", () => {
    const { diagnostics } = parseAndCheck(`
      ${prelude}

      datasource CmsSource {
        context { locale: Locale }
        for Entry
        for Asset
      }

      query Q(id: EntryId, lang: Locale) {
        context {
          locale: lang
        }
        root Entry(id: id, locale: lang)
        on Entry e { id type }
        on Asset a { id }
      }
    `);

    expect(diagnostics).toEqual([]);
  });

  it("rejects context.* in query bodies", () => {
    const { diagnostics } = parseAndCheck(`
      ${prelude}

      datasource CmsSource {
        context { locale: Locale }
        for Entry
        for Asset
      }

      query Q(id: EntryId, locale: Locale) {
        context { locale }
        root Entry(id: id, locale: context.locale)
        on Entry e { id type }
        on Asset a { id }
      }
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: "CONTEXT_FORBIDDEN_IN_QUERY" })
    );
  });
});
