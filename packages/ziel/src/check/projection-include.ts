import type { Expansion, FieldDecl, RefersTarget, TypeExpr } from "../ir";
import { typesSemanticallyEqual } from "./assignability";
import { expandPayloadObjectMembers, type PayloadTypeLookup } from "./discriminants";
import type { DiagnosticSink } from "./diagnostic";

export type { PayloadTypeLookup };

export type SelectableField = {
  name: string;
  refers: RefersTarget[] | null;
};

/** IR include mode on projection clauses / when-arms (`null` = omitted). */
export type IncludeMode = "all" | "properties" | "none";

type ObjectMember = Extract<TypeExpr, { kind: "object" }>;

/**
 * Merge types of the same field across union members into a single TypeExpr
 * (deduped flat union when members differ).
 */
function unionFieldTypes(types: TypeExpr[]): TypeExpr {
  const members: TypeExpr[] = [];
  const push = (t: TypeExpr): void => {
    if (t.kind === "union") {
      for (const m of t.members) push(m);
      return;
    }
    if (!members.some((m) => typesSemanticallyEqual(m, t))) {
      members.push(t);
    }
  };
  for (const t of types) push(t);
  if (members.length <= 1) {
    return members[0] ?? types[0]!;
  }
  return { kind: "union", members, span: null };
}

function mergeIntersectionField(decls: FieldDecl[]): FieldDecl {
  const first = decls[0]!;
  return {
    name: first.name,
    type: unionFieldTypes(decls.map((d) => d.type)),
    inheritedFromIdentity: decls.every((d) => d.inheritedFromIdentity),
    refers: decls.find((d) => d.refers !== null)?.refers ?? null,
    span: first.span,
  };
}

/**
 * Object fields present on every member of a closed object-union payload.
 * Single-object payloads return that object's fields unchanged. Non-object /
 * non-expandable payloads return `[]`.
 *
 * Shared field types are unioned across members (e.g. `kind: "Hero" | "Page"`).
 * `refers` is non-null when any member's field has `refers`.
 */
export function payloadIntersectionFields(
  payloadType: TypeExpr,
  resources: PayloadTypeLookup
): FieldDecl[] {
  const members = expandPayloadObjectMembers(payloadType, resources);
  if (members === null || members.length === 0) {
    return [];
  }
  if (members.length === 1) {
    return members[0]!.fields;
  }
  return intersectObjectFields(members);
}

function intersectObjectFields(members: ObjectMember[]): FieldDecl[] {
  const [first, ...rest] = members;
  const out: FieldDecl[] = [];
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
    out.push(mergeIntersectionField(decls));
  }
  return out;
}

/**
 * Fields selectable from a resource payload for `include all` / `include properties`.
 * Object payloads: all fields. Unions: **intersection** across members (same bar as
 * `UNKNOWN_SELECTED_FIELD` / `payloadHasField`).
 *
 * For intersection fields, `refers` is non-null when any member's field has `refers`.
 * `include none` does not use this list (empty auto-include).
 */
export function payloadSelectableFields(
  payloadType: TypeExpr,
  resources: PayloadTypeLookup
): SelectableField[] {
  return payloadIntersectionFields(payloadType, resources).map((f) => ({
    name: f.name,
    refers: f.refers,
  }));
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
 * `(explicitFields ∪ includeSet) − excludedFields − expandAliases`.
 *
 * `payloadType` is the payload to resolve against: the full resource payload for
 * flat clauses, or the **narrowed** arm payload for `when` arms. Callers pass
 * effective include (`arm.include ?? projection.include`).
 *
 * `include none` is a real mode (not `null`): auto-include is empty, but
 * explicit `selected` still remain. Omitted include (`null`) also yields an
 * empty auto-include set; inheritance is handled by callers via `??`.
 *
 * Expand aliases silently shadow same-named native fields. Callers should run
 * `UNKNOWN_SELECTED_FIELD` / type emit on this list. Callers should validate
 * `excludedFields` via {@link checkExcludedFields} before resolving.
 */
export function resolveSelectedFields(
  selected: readonly string[],
  expansions: readonly Expansion[],
  include: IncludeMode | null,
  payloadType: TypeExpr,
  resources: PayloadTypeLookup,
  excludedFields: readonly string[] = []
): string[] {
  const expandAliases = new Set(expansions.map((e) => e.alias));
  const excluded = new Set(excludedFields);
  const included =
    include === null || include === "none"
      ? []
      : includeFieldNames(include, payloadType, resources);

  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const name of [...included, ...selected]) {
    if (expandAliases.has(name) || excluded.has(name) || seen.has(name)) continue;
    seen.add(name);
    ordered.push(name);
  }
  return ordered;
}

/**
 * Validate `exclude` names against the (narrowed) payload and body selection.
 * Emits UNKNOWN_EXCLUDED_FIELD / EXCLUDED_SELECTED_FIELD / EXCLUDED_EXPAND_ALIAS.
 */
export function checkExcludedFields(
  excludedFields: readonly string[],
  selectedFields: readonly string[],
  expansions: readonly Expansion[],
  payloadType: TypeExpr,
  resources: PayloadTypeLookup,
  path: string,
  span: { start: number; end: number; uri: string | null } | null,
  sink: DiagnosticSink
): void {
  if (excludedFields.length === 0) return;

  const selectable = new Set(payloadSelectableFields(payloadType, resources).map((f) => f.name));
  const selected = new Set(selectedFields);
  const expandAliases = new Set(expansions.map((e) => e.alias));

  for (const name of excludedFields) {
    if (!selectable.has(name)) {
      sink.push({
        code: "UNKNOWN_EXCLUDED_FIELD",
        message: `Unknown excluded field '${name}'`,
        path: `${path}.exclude.${name}`,
        span,
      });
      continue;
    }
    if (selected.has(name)) {
      sink.push({
        code: "EXCLUDED_SELECTED_FIELD",
        message: `Field '${name}' cannot be both selected and excluded`,
        path: `${path}.exclude.${name}`,
        span,
      });
    }
    if (expandAliases.has(name)) {
      sink.push({
        code: "EXCLUDED_EXPAND_ALIAS",
        message: `Cannot exclude expand alias '${name}'`,
        path: `${path}.exclude.${name}`,
        span,
      });
    }
  }
}

/**
 * Normalize Langium `IncludeMode`
 * (`"includeall"` / `"includeproperties"` / `"includenone"`) to IR.
 */
export function normalizeIncludeMode(raw: string | undefined | null): IncludeMode | null {
  if (raw == null || raw === "") return null;
  const compact = raw.replace(/\s+/g, "").toLowerCase();
  if (compact === "includeall" || compact === "all") return "all";
  if (compact === "includeproperties" || compact === "properties") return "properties";
  if (compact === "includenone" || compact === "none") return "none";
  return null;
}
