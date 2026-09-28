import { describe, expect, it } from "vitest";

import type { ResourceSymbols } from "../check/symbols";
import type { FieldDecl, TypeExpr } from "../ir";
import {
  fieldHoverMarkdown,
  formatFieldSignature,
  formatFragmentSignature,
  formatResourceSignature,
  formatScalarSignature,
  fragmentHoverMarkdown,
  namedTypeHoverMarkdown,
  projectedFieldsType,
  resourceFieldHoverMarkdown,
  resourceHoverMarkdown,
  scalarHoverMarkdown,
} from "./hover-markdown";

function objectPayload(fields: { name: string; type: TypeExpr; optional?: boolean }[]): TypeExpr {
  return {
    kind: "object",
    fields: fields.map((f) => ({
      name: f.name,
      type: f.type,
      optional: f.optional ?? false,
      inheritedFromIdentity: false,
      refers: null,
      span: null,
    })),
    span: null,
  };
}

function entrySymbols(): ResourceSymbols {
  const idType: TypeExpr = { kind: "scalarRef", name: "EntryId", span: null };
  const localeType: TypeExpr = { kind: "scalarRef", name: "Locale", span: null };
  const titleType: TypeExpr = { kind: "primitive", name: "string", span: null };
  const payload = objectPayload([
    { name: "id", type: idType },
    { name: "title", type: titleType },
  ]);
  return {
    identity: new Map([
      [
        "id",
        {
          name: "id",
          type: idType,
          optional: false,
          inheritedFromIdentity: false,
          refers: null,
          span: null,
        },
      ],
      [
        "locale",
        {
          name: "locale",
          type: localeType,
          optional: false,
          inheritedFromIdentity: false,
          refers: null,
          span: null,
        },
      ],
    ]),
    payload: new Map([
      [
        "id",
        {
          name: "id",
          type: idType,
          optional: false,
          inheritedFromIdentity: true,
          refers: null,
          span: null,
        },
      ],
      [
        "title",
        {
          name: "title",
          type: titleType,
          optional: false,
          inheritedFromIdentity: false,
          refers: null,
          span: null,
        },
      ],
    ]),
    payloadType: payload,
  };
}

describe("hover-markdown builders", () => {
  it("formats scalar signatures", () => {
    expect(formatScalarSignature("EntryId", "string")).toBe("scalar EntryId on string");
    expect(scalarHoverMarkdown("EntryId", "string")).toContain("scalar EntryId on string");
  });

  it("formats resource signatures with identity + formatType(payload)", () => {
    const sig = formatResourceSignature("Entry", entrySymbols());
    expect(sig).toBe("resource Entry(id: EntryId, locale: Locale): { id: EntryId, title: string }");
    expect(resourceHoverMarkdown("Entry", entrySymbols())).toContain(sig);
  });

  it("formats field signatures via formatType", () => {
    const type: TypeExpr = {
      kind: "array",
      of: { kind: "resourceRef", name: "Entry", span: null },
      span: null,
    };
    expect(formatFieldSignature("items", type)).toBe("items: Entry[]");
    expect(
      fieldHoverMarkdown("title", { kind: "primitive", name: "string", span: null })
    ).toContain("title: string");
  });

  it("resolves named types from scalar / resource tables", () => {
    const scalars = new Map([
      [
        "EntryId",
        {
          name: "EntryId",
          representation: "string" as const,
          metadata: null,
          span: null,
        },
      ],
    ]);
    const resources = new Map([["Entry", entrySymbols()]]);

    expect(namedTypeHoverMarkdown("EntryId", scalars, resources)).toContain(
      "scalar EntryId on string"
    );
    expect(namedTypeHoverMarkdown("Entry", scalars, resources)).toContain(
      "resource Entry(id: EntryId, locale: Locale)"
    );
    expect(namedTypeHoverMarkdown("Unknown", scalars, resources)).toBeUndefined();
  });

  it("resolves payload fields from a resource table", () => {
    const resources = new Map([["Entry", entrySymbols()]]);
    expect(resourceFieldHoverMarkdown("Entry", "title", resources)).toContain("title: string");
    expect(resourceFieldHoverMarkdown("Entry", "id", resources)).toContain("id: EntryId");
    expect(resourceFieldHoverMarkdown("Entry", "missing", resources)).toBeUndefined();
  });

  it("formats fragment projected shapes", () => {
    const typeT: TypeExpr = { kind: "primitive", name: "string", span: null };
    const idT: TypeExpr = { kind: "scalarRef", name: "EntryId", span: null };
    const typeField: FieldDecl = {
      name: "type",
      type: typeT,
      optional: false,
      inheritedFromIdentity: false,
      refers: null,
      span: null,
    };
    const idField: FieldDecl = {
      name: "id",
      type: idT,
      optional: false,
      inheritedFromIdentity: true,
      refers: null,
      span: null,
    };
    const symbols: ResourceSymbols = {
      identity: new Map([["id", idField]]),
      payload: new Map([
        ["type", typeField],
        ["id", idField],
      ]),
      payloadType: objectPayload([
        { name: "type", type: typeT },
        { name: "id", type: idT },
      ]),
    };
    const resources = new Map<string, ResourceSymbols>([["Entry", symbols]]);
    const projected = projectedFieldsType(["type", "id"], "Entry", resources)!;
    expect(formatFragmentSignature("EntryBase", "Entry", projected)).toBe(
      "fragment EntryBase on Entry: { type: string, id: EntryId }"
    );
    expect(fragmentHoverMarkdown("EntryBase", "Entry", projected)).toContain(
      "{ type: string, id: EntryId }"
    );
  });
});
