import type { Expr, TypeExpr } from "../ir";
import { unwrapNullable, type ResourceTable } from "./symbols";

/** Lookup that only needs `payloadType` (ResourceTable or codegen ResourceIndex). */
export type PayloadTypeLookup = {
  get(name: string): { payloadType: TypeExpr } | undefined;
};

/** Atom constraint from `binding.<field> == / != / in / not in` (single-segment path). */
export type DiscConstraint = {
  field: string;
  mode: "eq" | "neq" | "in" | "not in";
  values: string[];
};

/** Filter tree: atoms plus `and` / `or` over member sets. */
export type DiscFilter = DiscConstraint | { op: "and" | "or"; left: DiscFilter; right: DiscFilter };

function isDiscAtom(filter: DiscFilter): filter is DiscConstraint {
  return !("op" in filter);
}

/**
 * Infer a closed string-literal discriminant on a payload (expanding
 * `resourceRef` members). Among object members, candidate fields are those
 * present on every member as `stringLiteral` with pairwise-disjoint values;
 * the lexicographically first such field wins. Returns `null` when none.
 */
export function closedLiteralDiscriminant(
  payloadType: TypeExpr,
  resources: PayloadTypeLookup
): { field: string; values: Set<string> } | null {
  const members = expandPayloadObjectMembers(payloadType, resources);
  if (members === null || members.length === 0) return null;
  return inferClosedLiteralDiscriminant(members);
}

function inferClosedLiteralDiscriminant(
  members: Extract<TypeExpr, { kind: "object" }>[]
): { field: string; values: Set<string> } | null {
  const candidateNames = new Set<string>();
  for (const field of members[0]!.fields) {
    if (field.type.kind === "stringLiteral") {
      candidateNames.add(field.name);
    }
  }
  for (const member of members.slice(1)) {
    const names = new Set(
      member.fields.filter((f) => f.type.kind === "stringLiteral").map((f) => f.name)
    );
    for (const name of [...candidateNames]) {
      if (!names.has(name)) candidateNames.delete(name);
    }
  }

  for (const field of [...candidateNames].sort()) {
    const values: string[] = [];
    let disjoint = true;
    const seen = new Set<string>();
    for (const member of members) {
      const f = member.fields.find((x) => x.name === field);
      if (!f || f.type.kind !== "stringLiteral") {
        disjoint = false;
        break;
      }
      if (seen.has(f.type.value)) {
        disjoint = false;
        break;
      }
      seen.add(f.type.value);
      values.push(f.type.value);
    }
    if (disjoint && values.length === members.length) {
      return { field, values: new Set(values) };
    }
  }
  return null;
}

/**
 * Expand a payload type to object members (following resourceRefs). Returns
 * `null` when the shape is not a closed object / object-union.
 */
export function expandPayloadObjectMembers(
  payloadType: TypeExpr,
  resources: PayloadTypeLookup
): Extract<TypeExpr, { kind: "object" }>[] | null {
  const unwrapped = unwrapNullable(payloadType);
  if (unwrapped.kind === "object") {
    return [unwrapped];
  }
  if (unwrapped.kind === "resourceRef") {
    const inner = resources.get(unwrapped.name);
    if (!inner) return null;
    return expandPayloadObjectMembers(inner.payloadType, resources);
  }
  if (unwrapped.kind === "union") {
    const objects: Extract<TypeExpr, { kind: "object" }>[] = [];
    for (const member of unwrapped.members) {
      const expanded = expandPayloadObjectMembers(member, resources);
      if (expanded === null) return null;
      objects.push(...expanded);
    }
    return objects;
  }
  return null;
}

export function payloadHasField(
  payloadType: TypeExpr,
  fieldName: string,
  resources: ResourceTable
): boolean {
  const unwrapped = unwrapNullable(payloadType);
  if (unwrapped.kind === "object") {
    return unwrapped.fields.some((f) => f.name === fieldName);
  }
  if (unwrapped.kind === "resourceRef") {
    const inner = resources.get(unwrapped.name);
    if (!inner) return false;
    return payloadHasField(inner.payloadType, fieldName, resources);
  }
  if (unwrapped.kind === "union") {
    return unwrapped.members.every((member) => payloadHasField(member, fieldName, resources));
  }
  return false;
}

function memberMatchesConstraint(
  member: Extract<TypeExpr, { kind: "object" }>,
  constraint: DiscConstraint
): boolean {
  const field = member.fields.find((f) => f.name === constraint.field);
  if (!field) return false;
  // Non-literal fields (e.g. `cta: string`) cannot refine the closed member set;
  // keep the member so `kind == "Footer" and e.cta == "…"` still narrows to Footer.
  if (field.type.kind !== "stringLiteral") return true;
  const value = field.type.value;
  switch (constraint.mode) {
    case "eq":
    case "in":
      return constraint.values.includes(value);
    case "neq":
    case "not in":
      return !constraint.values.includes(value);
  }
}

function memberMatchesFilter(
  member: Extract<TypeExpr, { kind: "object" }>,
  filter: DiscFilter
): boolean {
  if (!isDiscAtom(filter)) {
    if (filter.op === "and") {
      return memberMatchesFilter(member, filter.left) && memberMatchesFilter(member, filter.right);
    }
    return memberMatchesFilter(member, filter.left) || memberMatchesFilter(member, filter.right);
  }
  return memberMatchesConstraint(member, filter);
}

function matchMembers(
  members: Extract<TypeExpr, { kind: "object" }>[],
  filter: DiscFilter
): TypeExpr | undefined {
  const matched = members.filter((member) => memberMatchesFilter(member, filter));

  if (matched.length === 0) return undefined;
  if (matched.length === 1) return matched[0];
  return { kind: "union", members: matched, span: null };
}

/**
 * If `filter` is a discriminant predicate on `item.<field>` against a union of
 * objects with matching stringLiteral fields, return the matching member(s).
 * Supports `==` / `!=` / `in` / `not in` on any single-segment path.
 */
export function narrowItemTypeByFilter(
  elementType: TypeExpr,
  filter: Expr,
  itemBinding: string
): TypeExpr | undefined {
  const match = itemDiscriminantMatch(filter, itemBinding);
  if (!match) return undefined;

  const members =
    elementType.kind === "union"
      ? elementType.members.filter(
          (m): m is Extract<TypeExpr, { kind: "object" }> => m.kind === "object"
        )
      : elementType.kind === "object"
        ? [elementType]
        : null;
  if (!members || members.length === 0) return undefined;

  return matchMembers(members, match);
}

/**
 * Narrow a resource payload via discriminant filters on `binding.<field>`,
 * expanding resourceRef union members to their object payloads.
 * Supports `==` / `!=` / `in` / `not in` on any single-segment path.
 */
export function narrowPayloadByFilter(
  payloadType: TypeExpr,
  filter: Expr,
  binding: string,
  resources: PayloadTypeLookup
): TypeExpr | undefined {
  const match = payloadDiscriminantMatch(filter, binding);
  if (!match) return undefined;

  const members = expandPayloadObjectMembers(payloadType, resources);
  if (!members) return undefined;

  return matchMembers(members, match);
}

/** String labels covered by a positive discriminant filter (`==` or `in`). */
export function coveredDiscriminantLabels(
  filter: Expr,
  binding: string,
  side: "payload" | "item"
): string[] {
  const match =
    side === "payload"
      ? payloadDiscriminantMatch(filter, binding)
      : itemDiscriminantMatch(filter, binding);
  if (!match) return [];
  return positiveAtomLabels(match) ?? [];
}

export function itemDiscriminantLiteral(
  filter: Expr & { kind: "binary" },
  itemBinding: string
): { field: string; value: string } | undefined {
  const match = itemDiscriminantMatch(filter, itemBinding);
  if (match && isDiscAtom(match) && match.mode === "eq" && match.values.length === 1) {
    return { field: match.field, value: match.values[0]! };
  }
  return undefined;
}

export function payloadDiscriminantLiteral(
  filter: Expr & { kind: "binary" },
  binding: string
): { field: string; value: string } | undefined {
  const match = payloadDiscriminantMatch(filter, binding);
  if (match && isDiscAtom(match) && match.mode === "eq" && match.values.length === 1) {
    return { field: match.field, value: match.values[0]! };
  }
  return undefined;
}

export function itemDiscriminantMatch(filter: Expr, itemBinding: string): DiscFilter | undefined {
  return discriminantMatch(filter, { kind: "itemRef", binding: itemBinding });
}

export function payloadDiscriminantMatch(filter: Expr, binding: string): DiscFilter | undefined {
  return discriminantMatch(filter, { kind: "payloadRef", binding });
}

function discriminantMatch(
  filter: Expr,
  expected: { kind: "itemRef" | "payloadRef"; binding: string }
): DiscFilter | undefined {
  if (filter.kind !== "binary") return undefined;

  if (filter.op === "==" || filter.op === "!=") {
    const lit = singleStringDisc(filter, expected);
    if (!lit) return undefined;
    return {
      field: lit.field,
      mode: filter.op === "==" ? "eq" : "neq",
      values: [lit.value],
    };
  }

  if (filter.op === "in" || filter.op === "not in") {
    const membership = membershipStringDiscs(filter, expected);
    if (!membership) return undefined;
    return { field: membership.field, mode: filter.op, values: membership.values };
  }

  if (filter.op === "or" || filter.op === "and") {
    return combineDiscFilters(
      discriminantMatch(filter.left, expected),
      discriminantMatch(filter.right, expected),
      filter.op
    );
  }

  return undefined;
}

/** Positive disc labels only (`eq` / `in`) when the filter is a single-field atom. */
function positiveAtomLabels(filter: DiscFilter | undefined): string[] | null {
  if (!filter || !isDiscAtom(filter)) return null;
  if (filter.mode === "eq" || filter.mode === "in") return filter.values;
  return null;
}

function combineDiscFilters(
  left: DiscFilter | undefined,
  right: DiscFilter | undefined,
  op: "and" | "or"
): DiscFilter | undefined {
  if (!left && !right) return undefined;
  if (!left) return right;
  if (!right) return left;

  // Same-field positive atoms: collapse to a single `in` via union / intersection.
  if (isDiscAtom(left) && isDiscAtom(right) && left.field === right.field) {
    const leftVals = positiveAtomLabels(left);
    const rightVals = positiveAtomLabels(right);
    if (leftVals && rightVals) {
      if (op === "or") {
        return { field: left.field, mode: "in", values: [...new Set([...leftVals, ...rightVals])] };
      }
      const set = new Set(rightVals);
      return { field: left.field, mode: "in", values: leftVals.filter((v) => set.has(v)) };
    }
  }

  // Different fields (or non-positive modes): keep a member-set composition.
  return { op, left, right };
}

function singleStringDisc(
  filter: Expr & { kind: "binary" },
  expected: { kind: "itemRef" | "payloadRef"; binding: string }
): { field: string; value: string } | undefined {
  const sides: { left: Expr; right: Expr }[] = [
    { left: filter.left, right: filter.right },
    { left: filter.right, right: filter.left },
  ];
  for (const { left, right } of sides) {
    if (
      left.kind === expected.kind &&
      left.binding === expected.binding &&
      left.path.length === 1 &&
      right.kind === "literal" &&
      typeof right.value === "string"
    ) {
      return { field: left.path[0]!, value: right.value };
    }
  }
  return undefined;
}

function membershipStringDiscs(
  filter: Expr & { kind: "binary" },
  expected: { kind: "itemRef" | "payloadRef"; binding: string }
): { field: string; values: string[] } | undefined {
  const left = filter.left;
  const right = filter.right;
  if (
    left.kind !== expected.kind ||
    left.binding !== expected.binding ||
    left.path.length !== 1 ||
    right.kind !== "arrayLiteral"
  ) {
    return undefined;
  }
  const values: string[] = [];
  for (const el of right.elements) {
    if (el.kind !== "literal" || typeof el.value !== "string") {
      return undefined;
    }
    values.push(el.value);
  }
  return { field: left.path[0]!, values };
}
