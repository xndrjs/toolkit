import { describe, expect, it } from "vitest";

import { parseAndCheck } from "../compile/parse-and-check";
import {
  memberMatchesRefersPattern,
  membersMatchingRefersPattern,
  refersPatternFieldMissingOnAllMembers,
} from "./refers";
import type { ResourceTable } from "./symbols";
import { objectType, field, strLit, union, prim } from "../fixtures";

const menuMember = objectType(field("type", strLit("Menu")), field("title", prim("string")));
const footerMember = objectType(field("type", strLit("Footer")), field("title", prim("string")));
const pageMember = objectType(
  field("type", strLit("Page")),
  field("kind", strLit("site")),
  field("title", prim("string"))
);

describe("refers match helpers", () => {
  it("matches a member when every pattern field is a matching stringLiteral", () => {
    expect(
      memberMatchesRefersPattern(menuMember, [{ name: "type", values: ["Menu"], span: null }])
    ).toBe(true);
    expect(
      memberMatchesRefersPattern(menuMember, [{ name: "type", values: ["Footer"], span: null }])
    ).toBe(false);
  });

  it("requires AND across pattern fields and OR within a field's values", () => {
    expect(
      memberMatchesRefersPattern(pageMember, [
        { name: "type", values: ["Page"], span: null },
        { name: "kind", values: ["site"], span: null },
      ])
    ).toBe(true);
    expect(
      memberMatchesRefersPattern(pageMember, [
        { name: "type", values: ["Page"], span: null },
        { name: "kind", values: ["app"], span: null },
      ])
    ).toBe(false);
    expect(
      memberMatchesRefersPattern(menuMember, [
        { name: "type", values: ["Menu", "Footer"], span: null },
      ])
    ).toBe(true);
  });

  it("filters expanded payload members by pattern", () => {
    const resources: ResourceTable = new Map([
      [
        "Entry",
        {
          identity: new Map(),
          payload: new Map(),
          payloadType: union(menuMember, footerMember, pageMember),
        },
      ],
    ]);

    const matched = membersMatchingRefersPattern(
      { kind: "resourceRef", name: "Entry", span: null },
      [{ name: "type", values: ["Menu", "Footer"], span: null }],
      resources
    );
    expect(matched).toHaveLength(2);
    expect(matched?.map((m) => m.fields.find((f) => f.name === "type")?.type)).toEqual([
      strLit("Menu"),
      strLit("Footer"),
    ]);
  });

  it("reports pattern fields missing on all members", () => {
    expect(refersPatternFieldMissingOnAllMembers([menuMember, footerMember], "type")).toBe(false);
    expect(refersPatternFieldMissingOnAllMembers([menuMember, footerMember], "kind")).toBe(true);
  });
});

describe("checkProgram — refers", () => {
  const prelude = `
    scalar EntryId on string;
    scalar Locale on string;

    resource Entry(id: EntryId, locale: Locale):
      { type: "Menu", id, title: string }
      | { type: "Footer", id, title: string }
      | { type: "Page", id, kind: "site", title: string }
  `;

  it("accepts valid refers patterns (including nested fields)", () => {
    const { diagnostics } = parseAndCheck(`
      ${prelude}

      resource Page(id: EntryId, locale: Locale): {
        id
        menuId: EntryId refers Entry with { type: "Menu" }
        chromeId: EntryId refers Entry with { type: "Menu" | "Footer" }
        eitherId: EntryId refers Entry with { type: "Menu" } | Entry with { type: "Footer" }
        anyId: EntryId refers Entry
        strips: {
          linkId: EntryId refers Entry with { type: "Page", kind: "site" }
        }[]
      }
    `);

    expect(diagnostics).toEqual([]);
  });

  it("errors on unknown refers resource", () => {
    const { diagnostics } = parseAndCheck(`
      ${prelude}

      resource Page(id: EntryId, locale: Locale): {
        id
        menuId: EntryId refers Missing with { type: "Menu" }
      }
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "UNKNOWN_REFERS_RESOURCE",
        message: expect.stringContaining("Missing"),
      })
    );
  });

  it("errors when a pattern field is missing on all payload members", () => {
    const { diagnostics } = parseAndCheck(`
      ${prelude}

      resource Page(id: EntryId, locale: Locale): {
        id
        menuId: EntryId refers Entry with { typo: "Menu" }
      }
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "UNKNOWN_REFERS_FIELD",
        message: expect.stringContaining("typo"),
      })
    );
  });

  it("errors when the pattern matches no payload members", () => {
    const { diagnostics } = parseAndCheck(`
      ${prelude}

      resource Page(id: EntryId, locale: Locale): {
        id
        menuId: EntryId refers Entry with { type: "Hero" }
      }
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "REFERS_MATCHES_NOTHING",
        message: expect.stringContaining("Entry"),
      })
    );
  });

  it("does not require the annotated field type to be an id scalar", () => {
    const { diagnostics } = parseAndCheck(`
      ${prelude}

      resource Page(id: EntryId, locale: Locale): {
        id
        note: string refers Entry with { type: "Menu" }
      }
    `);

    expect(diagnostics).toEqual([]);
  });
});
