import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { checkProgram } from "../check";
import { createDiagnosticSink } from "../check/diagnostic";
import { pageDetailProgram } from "../fixtures";
import { isModel, type Model } from "../lang/generated/ast";
import { createZielServices } from "../lang/ziel-module";
import type { SourceSpan, TypeExpr } from "../ir";
import { lowerProgram } from "./lower";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

function parseSource(source: string): Model {
  const { Ziel } = createZielServices();
  const result = Ziel.parser.LangiumParser.parse(source);
  expect(result.parserErrors, JSON.stringify(result.parserErrors)).toEqual([]);
  expect(result.lexerErrors, JSON.stringify(result.lexerErrors)).toEqual([]);
  expect(isModel(result.value)).toBe(true);
  return result.value as Model;
}

function stripSpans(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripSpans);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = key === "span" ? null : stripSpans(child);
    }
    return out;
  }
  return value;
}

function expectSpan(span: SourceSpan | null | undefined): asserts span is SourceSpan {
  expect(span).toEqual(
    expect.objectContaining({
      start: expect.any(Number),
      end: expect.any(Number),
      uri: null,
    })
  );
  expect(span!.end).toBeGreaterThan(span!.start);
}

function objectFields(payloadType: TypeExpr | undefined) {
  expect(payloadType?.kind).toBe("object");
  if (payloadType?.kind !== "object") return [];
  return payloadType.fields;
}

describe("lowerProgram", () => {
  it("lowers page-detail.ziel to IR that typechecks and matches the fixture (spans ignored)", () => {
    const source = readFileSync(join(fixturesDir, "page-detail.ziel"), "utf8");
    const program = lowerProgram(parseSource(source));

    expect(checkProgram(program)).toEqual([]);
    expect(stripSpans(program)).toEqual(stripSpans(pageDetailProgram()));
  });

  it("sets ariType=name, payload shorthand, PathRef classification, and CST spans", () => {
    const program = lowerProgram(
      parseSource(`
        scalar PostId on string;
        scalar UserId on string;

        resource Post(id: PostId): {
          id
          authorId: UserId
        }

        resource User(id: UserId): {
          id
        }

        query PostDetail(postId: PostId) {
          root Post(id: postId)
          on Post p {
            id
            expand author: User(id: p.authorId)
            expand self: User(id: @p.id)
          }
        }
      `)
    );

    const post = program.resources.find((r) => r.name === "Post");
    expect(post?.ariType).toBe("Post");
    const fields = objectFields(post?.payloadType);
    expect(fields[0]).toMatchObject({
      name: "id",
      inheritedFromIdentity: true,
      type: { kind: "scalarRef", name: "PostId" },
    });
    expect(fields[1]?.inheritedFromIdentity).toBe(false);

    const query = program.queries[0]!;
    expect(query.roots[0]?.construction.args[0]?.value).toMatchObject({
      kind: "param",
      name: "postId",
    });
    expect(query.projections[0]?.expansions[0]?.target?.args[0]?.value).toMatchObject({
      kind: "payloadRef",
      binding: "p",
      path: ["authorId"],
    });
    expect(query.projections[0]?.expansions[1]?.target?.args[0]?.value).toMatchObject({
      kind: "identityRef",
      binding: "p",
      path: ["id"],
    });
    expect(query.projections[0]?.expansions[0]?.multiplicity).toBe("one");

    expectSpan(program.span);
    expectSpan(post?.span);
    expectSpan(query.span);
    expectSpan(query.roots[0]?.span);
  });

  it("lowers literals without collapsing scalarRef types", () => {
    const program = lowerProgram(
      parseSource(`
        scalar Id on string;
        resource R(id: Id): { id }
        query Q(x: Id) {
          root R(id: x, a: "hi", n: 1.5, t: true, z: null)
        }
      `)
    );

    const args = program.queries[0]!.roots[0]!.construction.args;
    expect(args.map((a) => a.value)).toEqual([
      expect.objectContaining({ kind: "param", name: "x" }),
      expect.objectContaining({ kind: "literal", value: "hi" }),
      expect.objectContaining({ kind: "literal", value: 1.5 }),
      expect.objectContaining({ kind: "literal", value: true }),
      expect.objectContaining({ kind: "literal", value: null }),
    ]);

    expect(program.resources[0]?.identity.fields[0]?.type).toEqual(
      expect.objectContaining({ kind: "scalarRef", name: "Id" })
    );
  });

  it("lowers object and array payload types into IR", () => {
    const program = lowerProgram(
      parseSource(`
        scalar MenuId on string;
        scalar Locale on string;
        scalar AssetId on string;

        resource Menu(id: MenuId, locale: Locale): {
          id
          title: string
          logoId: AssetId
          meta: {
            count: number;
            isActive: boolean;
            name: string;
          }
          slides: {
            name: string;
          }[]
          tags: string[]
        }

        query MenuDetail(menuId: MenuId) {
          context { locale: Locale }
          root Menu(id: menuId, locale: context.locale)
          on Menu m { id title }
        }
      `)
    );

    expect(checkProgram(program)).toEqual([]);

    const fields = objectFields(program.resources.find((r) => r.name === "Menu")?.payloadType);
    expect(fields.find((f) => f.name === "meta")?.type).toMatchObject({
      kind: "object",
      fields: [
        { name: "count", type: { kind: "primitive", name: "number" } },
        { name: "isActive", type: { kind: "primitive", name: "boolean" } },
        { name: "name", type: { kind: "primitive", name: "string" } },
      ],
    });
    expect(fields.find((f) => f.name === "slides")?.type).toMatchObject({
      kind: "array",
      of: {
        kind: "object",
        fields: [{ name: "name", type: { kind: "primitive", name: "string" } }],
      },
    });
    expect(fields.find((f) => f.name === "tags")?.type).toMatchObject({
      kind: "array",
      of: { kind: "primitive", name: "string" },
    });
  });

  it("lowers each-expand into multiplicity many + arms + itemRef", () => {
    const program = lowerProgram(
      parseSource(`
        scalar PageId on string;
        scalar Locale on string;
        scalar HeroId on string;

        resource Page(id: PageId, locale: Locale): {
          id
          strips: { type: "Hero", id: HeroId }[]
        }

        resource Hero(id: HeroId, locale: Locale): { type: "Hero", id }

        query Q(pageId: PageId) {
          context { locale: Locale }
          root Page(id: pageId, locale: context.locale)
          on Page p {
            id
            expand strips: each s in p.strips (
              Hero(id: s.id, locale: context.locale) when s.type == "Hero"
            )
          }
          on Hero h { id }
        }
      `)
    );

    expect(checkProgram(program)).toEqual([]);
    const strips = program.queries[0]!.projections[0]!.expansions[0]!;
    expect(strips).toMatchObject({
      alias: "strips",
      multiplicity: "many",
      target: null,
      comprehension: {
        itemBinding: "s",
        source: { kind: "payloadRef", binding: "p", path: ["strips"] },
        arms: [
          {
            when: {
              kind: "binary",
              op: "==",
              left: { kind: "itemRef", binding: "s", path: ["type"] },
              right: { kind: "literal", value: "Hero" },
            },
            target: {
              resource: "Hero",
              args: [
                { name: "id", value: { kind: "itemRef", binding: "s", path: ["id"] } },
                { name: "locale", value: { kind: "context", path: ["locale"] } },
              ],
            },
          },
        ],
      },
    });
  });

  it("lowers projection when-arms with payloadRef filters", () => {
    const program = lowerProgram(
      parseSource(`
        scalar EntryId on string;
        scalar Locale on string;
        scalar AssetId on string;

        resource Entry(id: EntryId, locale: Locale):
          { type: "Hero", id, title: string, imageId: AssetId }
          | { type: "Page", id }

        resource Asset(id: AssetId, locale: Locale): { id }

        query Q(entryId: EntryId) {
          context { locale: Locale }
          root Entry(id: entryId, locale: context.locale)
          on Entry e {
            when e.type == "Hero" {
              id
              expand image: Asset(id: e.imageId, locale: context.locale)
            }
            when e.type == "Page" {
              id
            }
          }
          on Asset a { id }
        }
      `)
    );

    expect(checkProgram(program)).toEqual([]);
    const entry = program.queries[0]!.projections[0]!;
    expect(entry).toMatchObject({
      resource: "Entry",
      binding: "e",
      selectedFields: [],
      expansions: [],
    });
    expect(entry.arms).toHaveLength(2);
    expect(entry.arms![0]).toMatchObject({
      when: {
        kind: "binary",
        op: "==",
        left: { kind: "payloadRef", binding: "e", path: ["type"] },
        right: { kind: "literal", value: "Hero" },
      },
      selectedFields: ["id"],
      expansions: [
        {
          alias: "image",
          multiplicity: "one",
          target: {
            resource: "Asset",
            args: [
              { name: "id", value: { kind: "payloadRef", binding: "e", path: ["imageId"] } },
              { name: "locale", value: { kind: "context", path: ["locale"] } },
            ],
          },
        },
      ],
    });
    expect(entry.arms![1]).toMatchObject({
      selectedFields: ["id"],
      expansions: [],
      when: {
        kind: "binary",
        op: "==",
        left: { kind: "payloadRef", binding: "e", path: ["type"] },
        right: { kind: "literal", value: "Page" },
      },
    });
  });
});

const FRAGMENT_PRELUDE = `
  scalar EntryId on string;
  scalar Locale on string;
  scalar AssetId on string;

  resource Entry(id: EntryId, locale: Locale):
    { type: "Hero", id, title: string, imageId: AssetId }
    | { type: "Menu", id, title: string, logoId: AssetId }
    | { type: "Page", id }

  resource Asset(id: AssetId, locale: Locale): { id }
`;

describe("lowerProgram — fragments", () => {
  it("distributes on-level preamble into every when-arm", () => {
    const program = lowerProgram(
      parseSource(`
        ${FRAGMENT_PRELUDE}

        fragment EntryBase on Entry e { type id }

        query Q(entryId: EntryId) {
          context { locale: Locale }
          root Entry(id: entryId, locale: context.locale)
          on Entry e {
            ...EntryBase
            when e.type == "Hero" { title }
            when e.type == "Menu" { title }
            when e.type == "Page" { }
          }
          on Asset a { id }
        }
      `)
    );

    expect(checkProgram(program)).toEqual([]);
    const entry = program.queries[0]!.projections[0]!;
    expect(entry.selectedFields).toEqual([]);
    expect(entry.expansions).toEqual([]);
    expect(entry.arms).toHaveLength(3);
    expect(entry.arms![0]).toMatchObject({
      selectedFields: ["type", "id", "title"],
      expansions: [],
    });
    expect(entry.arms![1]).toMatchObject({
      selectedFields: ["type", "id", "title"],
      expansions: [],
    });
    expect(entry.arms![2]).toMatchObject({
      selectedFields: ["type", "id"],
      expansions: [],
    });
  });

  it("expands nested spreads and rewrites fragment binding to enclosing on binding", () => {
    const program = lowerProgram(
      parseSource(`
        ${FRAGMENT_PRELUDE}

        fragment EntryBase on Entry x { type id }

        fragment EntryLogo on Entry x {
          ...EntryBase
          title
          expand logo: Asset(id: x.logoId, locale: context.locale)
        }

        query Q(entryId: EntryId) {
          context { locale: Locale }
          root Entry(id: entryId, locale: context.locale)
          on Entry e {
            when e.type == "Hero" { type id title }
            when e.type == "Menu" {
              ...EntryLogo
            }
            when e.type == "Page" { type id }
          }
          on Asset a { id }
        }
      `)
    );

    expect(checkProgram(program)).toEqual([]);
    const arm = program.queries[0]!.projections[0]!.arms![1]!;
    expect(arm.selectedFields).toEqual(["type", "id", "title"]);
    expect(arm.expansions).toHaveLength(1);
    expect(arm.expansions[0]).toMatchObject({
      alias: "logo",
      multiplicity: "one",
      target: {
        resource: "Asset",
        args: [
          { name: "id", value: { kind: "payloadRef", binding: "e", path: ["logoId"] } },
          { name: "locale", value: { kind: "context", path: ["locale"] } },
        ],
      },
    });
  });

  it("expands spreads in flat on bodies", () => {
    const program = lowerProgram(
      parseSource(`
        scalar AssetId on string;
        scalar Locale on string;
        resource Asset(id: AssetId, locale: Locale): { id title: string }
        fragment AssetBase on Asset a { id title }
        query Q(id: AssetId) {
          context { locale: Locale }
          root Asset(id: id, locale: context.locale)
          on Asset b { ...AssetBase }
        }
      `)
    );

    expect(checkProgram(program)).toEqual([]);
    expect(program.queries[0]!.projections[0]).toMatchObject({
      selectedFields: ["id", "title"],
      expansions: [],
      arms: null,
    });
  });

  it("lowers include all / include properties onto ResourceProjection.include", () => {
    const program = lowerProgram(
      parseSource(`
        scalar Id on string;
        resource Page(id: Id): { id title: string strips: { id: Id }[] }
        query Q(id: Id) {
          root Page(id: id)
          on Page p include all { id }
          on Page q include properties { title }
          on Page r { id }
        }
      `)
    );

    expect(checkProgram(program)).toEqual([]);
    expect(program.queries[0]!.projections.map((p) => p.include)).toEqual([
      "all",
      "properties",
      null,
    ]);
  });

  it("lowers include on when-arms (override vs inherit from clause)", () => {
    const program = lowerProgram(
      parseSource(`
        scalar Id on string;
        resource Entry(id: Id):
          { type: "Hero", id, title: string }
          | { type: "Page", id }
        query Q(id: Id) {
          root Entry(id: id)
          on Entry e include all {
            when e.type == "Hero" include properties { id }
            when e.type == "Page" { id }
          }
          on Entry f {
            when f.type == "Hero" include all { id }
            when f.type == "Page" { id }
          }
        }
      `)
    );

    const [withClause, withoutClause] = program.queries[0]!.projections;
    expect(withClause!.include).toBe("all");
    expect(withClause!.arms!.map((arm) => arm.include)).toEqual(["properties", null]);
    expect(withoutClause!.include).toBeNull();
    expect(withoutClause!.arms!.map((arm) => arm.include)).toEqual(["all", null]);
  });

  it("reports UNKNOWN_FRAGMENT, FRAGMENT_RESOURCE_MISMATCH, and FRAGMENT_CYCLE", () => {
    const sink = createDiagnosticSink();
    lowerProgram(
      parseSource(`
        ${FRAGMENT_PRELUDE}

        fragment EntryBase on Entry e { type }
        fragment Boom on Entry e { ...Boom }
        fragment AssetOnly on Asset a { id }

        query Q(entryId: EntryId) {
          context { locale: Locale }
          root Entry(id: entryId, locale: context.locale)
          on Entry e {
            when e.type == "Hero" {
              ...Missing
              ...AssetOnly
              ...Boom
            }
          }
          on Asset a { id }
        }
      `),
      sink
    );

    expect(sink.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "UNKNOWN_FRAGMENT",
        message: expect.stringContaining("Missing"),
      })
    );
    expect(sink.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "FRAGMENT_RESOURCE_MISMATCH",
        message: expect.stringContaining("AssetOnly"),
      })
    );
    expect(sink.diagnostics).toContainEqual(
      expect.objectContaining({ code: "FRAGMENT_CYCLE", message: expect.stringContaining("Boom") })
    );
  });

  it("reports DUPLICATE_SELECTED_FIELD for repeated fields in a when arm", () => {
    const sink = createDiagnosticSink();
    lowerProgram(
      parseSource(`
        ${FRAGMENT_PRELUDE}

        query Q(entryId: EntryId) {
          context { locale: Locale }
          root Entry(id: entryId, locale: context.locale)
          on Entry e {
            when e.type == "Hero" {
              title
              title
            }
          }
          on Asset a { id }
        }
      `),
      sink
    );

    const dup = sink.diagnostics.find((d) => d.code === "DUPLICATE_SELECTED_FIELD");
    expect(dup).toMatchObject({
      code: "DUPLICATE_SELECTED_FIELD",
      message: "Duplicate selected field 'title'",
    });
    // Span should cover the second `title` token, not the whole when-arm.
    expect(dup?.span).toBeTruthy();
    expect((dup!.span!.end ?? 0) - (dup!.span!.start ?? 0)).toBeLessThan(20);
  });

  it("reports DUPLICATE_SELECTED_FIELD after flatten of preamble + arm", () => {
    const sink = createDiagnosticSink();
    lowerProgram(
      parseSource(`
        ${FRAGMENT_PRELUDE}

        fragment EntryBase on Entry e { type id }

        query Q(entryId: EntryId) {
          context { locale: Locale }
          root Entry(id: entryId, locale: context.locale)
          on Entry e {
            ...EntryBase
            when e.type == "Hero" {
              type
              title
            }
          }
          on Asset a { id }
        }
      `),
      sink
    );

    expect(sink.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "DUPLICATE_SELECTED_FIELD",
        message: expect.stringContaining("type"),
      })
    );
  });

  it("lowers resolve-only on clauses into resolveArms (no projection body)", () => {
    const program = lowerProgram(
      parseSource(`
        scalar SpaceId on string;
        scalar EnvironmentId on string;
        scalar Locale on string;
        scalar Ref on string;

        resource Entry(spaceId: SpaceId, environmentId: EnvironmentId, id: string, locale: Locale): {
          id
        }
        resource Asset(spaceId: SpaceId, environmentId: EnvironmentId, id: string, locale: Locale): {
          id
        }
        resource CustomReference(ref: Ref, locale: Locale): {
          type: "Entry" | "Asset"
          spaceId: SpaceId
          environmentId: EnvironmentId
          id: string
          locale: Locale
        }

        query Q(ref: Ref) {
          context { locale: Locale }
          root CustomReference(ref: ref, locale: context.locale)
          on CustomReference c resolve to {
            Entry(
              spaceId: c.spaceId,
              environmentId: c.environmentId,
              id: c.id,
              locale: c.locale
            ) when c.type == "Entry"
            Asset(
              spaceId: c.spaceId,
              environmentId: c.environmentId,
              id: c.id,
              locale: c.locale
            ) when c.type == "Asset"
          }
          on Entry e { id }
          on Asset a { id }
        }
      `)
    );

    expect(program.queries[0]!.projections[0]).toMatchObject({
      resource: "CustomReference",
      binding: "c",
      selectedFields: [],
      expansions: [],
      arms: null,
      resolveArms: [
        {
          target: { resource: "Entry" },
          when: {
            kind: "binary",
            op: "==",
            left: { kind: "payloadRef", binding: "c", path: ["type"] },
            right: { kind: "literal", value: "Entry" },
          },
        },
        {
          target: { resource: "Asset" },
          when: {
            kind: "binary",
            op: "==",
            left: { kind: "payloadRef", binding: "c", path: ["type"] },
            right: { kind: "literal", value: "Asset" },
          },
        },
      ],
    });
    expect(checkProgram(program)).toEqual([]);
  });

  it("rejects mixing resolve to with a projection body at parse time", () => {
    const { Ziel } = createZielServices();
    const result = Ziel.parser.LangiumParser.parse(`
      scalar Id on string;
      resource R(id: Id): { id }
      resource T(id: Id): { id }
      query Q(id: Id) {
        root R(id: id)
        on R r resolve to {
          T(id: r.id)
        } {
          id
        }
      }
    `);
    expect(result.parserErrors.length).toBeGreaterThan(0);
  });

  it("lowers singular root to one QueryRoot with alias null", () => {
    const program = lowerProgram(
      parseSource(`
        scalar Id on string;
        resource R(id: Id): { id }
        query Q(id: Id) {
          root R(id: id)
        }
      `)
    );

    expect(program.queries[0]?.roots).toEqual([
      expect.objectContaining({
        alias: null,
        construction: expect.objectContaining({
          resource: "R",
          args: [expect.objectContaining({ name: "id" })],
        }),
      }),
    ]);
  });

  it("lowers multi-root entries with aliases", () => {
    const program = lowerProgram(
      parseSource(`
        scalar PageId on string;
        scalar SessionId on string;
        resource Page(id: PageId): { id }
        resource UserSession(id: SessionId): { id }
        query Homepage(pageId: PageId, sessionId: SessionId) {
          roots {
            page: Page(id: pageId)
            session: UserSession(id: sessionId)
          }
          on Page p { id }
          on UserSession s { id }
        }
      `)
    );

    expect(program.queries[0]?.roots).toEqual([
      expect.objectContaining({
        alias: "page",
        construction: expect.objectContaining({ resource: "Page" }),
      }),
      expect.objectContaining({
        alias: "session",
        construction: expect.objectContaining({ resource: "UserSession" }),
      }),
    ]);
    expect(checkProgram(program)).toEqual([]);
  });

  it("lowers ObjectField refers patterns (single, AND, literal OR, multi-target, nested, absent)", () => {
    const program = lowerProgram(
      parseSource(`
        scalar EntryId on string;

        resource Entry(id: EntryId): {
          id
          type: "Menu" | "Footer" | "Page"
        }

        resource Page(id: EntryId): {
          id
          menuId: EntryId refers Entry with { type: "Menu" }
          chromeId: EntryId refers Entry with { type: "Menu" | "Footer" }
          eitherId: EntryId refers Entry with { type: "Menu" } | Entry with { type: "Footer" }
          nested: {
            linkId: EntryId refers Entry with { type: "Page", kind: "site" }
          }
          plainId: EntryId
          idShorthand
        }
      `)
    );

    const page = program.resources.find((r) => r.name === "Page");
    const fields = objectFields(page?.payloadType);
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));

    expect(byName.menuId?.refers).toHaveLength(1);
    expect(byName.menuId?.refers?.[0]).toMatchObject({
      resource: "Entry",
      fields: [{ name: "type", values: ["Menu"] }],
    });

    expect(byName.chromeId?.refers?.[0]?.fields[0]?.values).toEqual(["Menu", "Footer"]);

    expect(byName.eitherId?.refers?.map((t) => t.fields[0]?.values)).toEqual([
      ["Menu"],
      ["Footer"],
    ]);

    const nested = byName.nested?.type;
    expect(nested?.kind).toBe("object");
    if (nested?.kind === "object") {
      expect(nested.fields[0]?.refers?.[0]).toMatchObject({
        resource: "Entry",
        fields: [
          { name: "type", values: ["Page"] },
          { name: "kind", values: ["site"] },
        ],
      });
    }

    expect(byName.plainId?.refers).toBeNull();
    expect(byName.idShorthand).toMatchObject({
      inheritedFromIdentity: true,
      refers: null,
    });
  });

  it("lowers islands clauses (when or / unconditional)", () => {
    const program = lowerProgram(
      parseSource(`
        scalar EntryId on string;
        scalar Locale on string;

        resource Entry(id: EntryId, locale: Locale): {
          id
          type: string
        }

        resource Page(id: EntryId, locale: Locale): {
          id
        }

        query Q(pageId: EntryId) {
          context { locale: Locale }
          root Page(id: pageId, locale: context.locale)
          on Page p { id }
          on Entry e { id type }
          islands {
            on Entry e when e.type == "Menu" or e.type == "Footer"
            on Page
          }
        }
      `)
    );

    expect(checkProgram(program)).toEqual([]);
    expect(stripSpans(program.queries[0]!.islands)).toEqual([
      {
        resource: "Entry",
        binding: "e",
        when: {
          kind: "binary",
          op: "or",
          left: {
            kind: "binary",
            op: "==",
            left: { kind: "payloadRef", binding: "e", path: ["type"], span: null },
            right: { kind: "literal", value: "Menu", span: null },
            span: null,
          },
          right: {
            kind: "binary",
            op: "==",
            left: { kind: "payloadRef", binding: "e", path: ["type"], span: null },
            right: { kind: "literal", value: "Footer", span: null },
            span: null,
          },
          span: null,
        },
        span: null,
      },
      {
        resource: "Page",
        binding: null,
        when: null,
        span: null,
      },
    ]);
    expectSpan(program.queries[0]!.islands[0]?.span);
  });

  it("lowers in / not in / unary ! in when clauses", () => {
    const program = lowerProgram(
      parseSource(`
      scalar EntryId on string;
      scalar Locale on string;

      resource Entry(id: EntryId, locale: Locale): {
        type: string
        id
        visible: boolean
      }

      query Q(pageId: EntryId) {
        context { locale: Locale }
        root Entry(id: pageId, locale: context.locale)
        on Entry e {
          when e.type in ["Menu", "Footer"] { id }
          when e.type not in ["Hero"] { id }
          when !e.visible { id }
        }
        islands {
          on Entry e when e.type in ["Menu", "Footer"] or !e.visible
        }
      }
    `)
    );

    const arms = program.queries[0]!.projections[0]!.arms!;
    expect(stripSpans(arms[0]!.when)).toEqual({
      kind: "binary",
      op: "in",
      left: { kind: "payloadRef", binding: "e", path: ["type"], span: null },
      right: {
        kind: "arrayLiteral",
        elements: [
          { kind: "literal", value: "Menu", span: null },
          { kind: "literal", value: "Footer", span: null },
        ],
        span: null,
      },
      span: null,
    });
    expect(stripSpans(arms[1]!.when)).toEqual({
      kind: "binary",
      op: "not in",
      left: { kind: "payloadRef", binding: "e", path: ["type"], span: null },
      right: {
        kind: "arrayLiteral",
        elements: [{ kind: "literal", value: "Hero", span: null }],
        span: null,
      },
      span: null,
    });
    expect(stripSpans(arms[2]!.when)).toEqual({
      kind: "unary",
      op: "!",
      operand: { kind: "payloadRef", binding: "e", path: ["visible"], span: null },
      span: null,
    });

    expect(stripSpans(program.queries[0]!.islands[0]!.when)).toMatchObject({
      kind: "binary",
      op: "or",
    });
  });
});
