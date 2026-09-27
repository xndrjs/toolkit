import type { Expansion, FieldDecl, RefersTarget, TypeExpr } from "../ir";
import { expandPayloadObjectMembers, type PayloadTypeLookup } from "./discriminants";

export type { PayloadTypeLookup };

export type SelectableField = {
  name: string;
  refers: RefersTarget[] | null;
};

/**
 * Fields selectable from a resource payload for `include all` / `include properties`.
 * Object payloads: all fields. Unions: **intersection** across members (same bar as
 * `UNKNOWN_SELECTED_FIELD` / `payloadHasField`).
 *
 * For intersection fields, `refers` is non-null when any member's field has `refers`.
 */
export function payloadSelectableFields(
  payloadType: TypeExpr,
  resources: PayloadTypeLookup
): SelectableField[] {
  const members = expandPayloadObjectMembers(payloadType, resources);
  if (members === null || members.length === 0) {
    return [];
  }

  if (members.length === 1) {
    return members[0]!.fields.map((f) => ({ name: f.name, refers: f.refers }));
  }

  const [first, ...rest] = members;
  const out: SelectableField[] = [];
  for (const field of first!.fields) {
    const decls: FieldDecl[] = [field];
    let onAll = true;
    for (const member of rest) {
      const match = member.fields.find((f) => f.name === field.name);
      if (!match) {
        onAll = false;
        break;
      }
      decls.push(match);
    }
    if (!onAll) continue;
    const refers = decls.find((d) => d.refers !== null)?.refers ?? null;
    out.push({ name: field.name, refers });
  }
  return out;
}

function includeFieldNames(
  include: "all" | "properties",
  payloadType: TypeExpr,
  resources: PayloadTypeLookup
): string[] {
  const fields = payloadSelectableFields(payloadType, resources);
  if (include === "all") {
    return fields.map((f) => f.name);
  }
  return fields.filter((f) => f.refers === null).map((f) => f.name);
}

/**
 * Effective selected field names for a projection body (flat or one when-arm):
 * `(explicitFields ∪ includeSet) − expandAliases`.
 *
 * Expand aliases silently shadow same-named native fields. Callers should run
 * `UNKNOWN_SELECTED_FIELD` / type emit on this list.
 */
export function resolveSelectedFields(
  selected: readonly string[],
  expansions: readonly Expansion[],
  include: "all" | "properties" | null,
  resourceName: string,
  resources: PayloadTypeLookup
): string[] {
  const expandAliases = new Set(expansions.map((e) => e.alias));
  const resource = resources.get(resourceName);
  const included =
    include !== null && resource ? includeFieldNames(include, resource.payloadType, resources) : [];

  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const name of [...included, ...selected]) {
    if (expandAliases.has(name) || seen.has(name)) continue;
    seen.add(name);
    ordered.push(name);
  }
  return ordered;
}

/** Normalize Langium `IncludeMode` (`"includeall"` / `"includeproperties"`) to IR. */
export function normalizeIncludeMode(raw: string | undefined | null): "all" | "properties" | null {
  if (raw == null || raw === "") return null;
  const compact = raw.replace(/\s+/g, "").toLowerCase();
  if (compact === "includeall" || compact === "all") return "all";
  if (compact === "includeproperties" || compact === "properties") return "properties";
  return null;
}
