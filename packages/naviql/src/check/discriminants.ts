import type { Expr, TypeExpr } from "../ir";
import { unwrapNullable, type ResourceTable } from "./symbols";

/** Returns the set of `type` literal values when element is a closed disc. union; else null. */
export function closedTypeDiscriminants(elementType: TypeExpr): Set<string> | null {
  const members =
    elementType.kind === "union"
      ? elementType.members
      : elementType.kind === "object"
        ? [elementType]
        : null;
  if (!members || members.length === 0) return null;

  const values = new Set<string>();
  for (const member of members) {
    if (member.kind !== "object") return null;
    const typeField = member.fields.find((f) => f.name === "type");
    if (!typeField || typeField.type.kind !== "stringLiteral") return null;
    values.add(typeField.type.value);
  }
  return values;
}

/**
 * Closed `type` discriminants on a resource payload, expanding `resourceRef`
 * members to their object payloads when possible.
 */
export function closedPayloadDiscriminants(
  payloadType: TypeExpr,
  resources: ResourceTable
): Set<string> | null {
  const members = expandPayloadObjectMembers(payloadType, resources);
  if (members === null || members.length === 0) return null;

  const values = new Set<string>();
  for (const member of members) {
    const typeField = member.fields.find((f) => f.name === "type");
    if (!typeField || typeField.type.kind !== "stringLiteral") return null;
    values.add(typeField.type.value);
  }
  return values;
}

/**
 * Expand a payload type to object members (following resourceRefs). Returns
 * `null` when the shape is not a closed object / object-union.
 */
export function expandPayloadObjectMembers(
  payloadType: TypeExpr,
  resources: ResourceTable
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

type DiscMatch = { mode: "eq" | "neq" | "in" | "not in"; values: string[] };

function matchMembers(
  members: Extract<TypeExpr, { kind: "object" }>[],
  match: DiscMatch
): TypeExpr | undefined {
  const matched = members.filter((member) => {
    const typeField = member.fields.find((f) => f.name === "type");
    if (!typeField || typeField.type.kind !== "stringLiteral") return false;
    const value = typeField.type.value;
    switch (match.mode) {
      case "eq":
        return match.values.includes(value);
      case "neq":
        return !match.values.includes(value);
      case "in":
        return match.values.includes(value);
      case "not in":
        return !match.values.includes(value);
    }
  });

  if (matched.length === 0) return undefined;
  if (matched.length === 1) return matched[0];
  return { kind: "union", members: matched, span: null };
}

/**
 * If `filter` is a discriminant predicate on `item.type` against a union of
 * objects with `type` stringLiteral fields, return the matching member(s).
 * Supports `==` / `!=` / `in` / `not in`.
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
 * Narrow a resource payload via discriminant filters on `binding.type`,
 * expanding resourceRef union members to their object payloads.
 * Supports `==` / `!=` / `in` / `not in`.
 */
export function narrowPayloadByFilter(
  payloadType: TypeExpr,
  filter: Expr,
  binding: string,
  resources: ResourceTable
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
  if (match.mode === "eq" || match.mode === "in") {
    return match.values;
  }
  return [];
}

export function itemDiscriminantLiteral(
  filter: Expr & { kind: "binary" },
  itemBinding: string
): { value: string } | undefined {
  const match = itemDiscriminantMatch(filter, itemBinding);
  if (match?.mode === "eq" && match.values.length === 1) {
    return { value: match.values[0]! };
  }
  return undefined;
}

export function payloadDiscriminantLiteral(
  filter: Expr & { kind: "binary" },
  binding: string
): { value: string } | undefined {
  const match = payloadDiscriminantMatch(filter, binding);
  if (match?.mode === "eq" && match.values.length === 1) {
    return { value: match.values[0]! };
  }
  return undefined;
}

export function itemDiscriminantMatch(filter: Expr, itemBinding: string): DiscMatch | undefined {
  return discriminantMatch(filter, { kind: "itemRef", binding: itemBinding });
}

export function payloadDiscriminantMatch(filter: Expr, binding: string): DiscMatch | undefined {
  return discriminantMatch(filter, { kind: "payloadRef", binding });
}

function discriminantMatch(
  filter: Expr,
  expected: { kind: "itemRef" | "payloadRef"; binding: string }
): DiscMatch | undefined {
  if (filter.kind !== "binary") return undefined;

  if (filter.op === "==" || filter.op === "!=") {
    const lit = singleStringDisc(filter, expected);
    if (!lit) return undefined;
    return { mode: filter.op === "==" ? "eq" : "neq", values: [lit] };
  }

  if (filter.op === "in" || filter.op === "not in") {
    const values = membershipStringDiscs(filter, expected);
    if (!values) return undefined;
    return { mode: filter.op, values };
  }

  if (filter.op === "or" || filter.op === "and") {
    return combineDiscMatches(
      discriminantMatch(filter.left, expected),
      discriminantMatch(filter.right, expected),
      filter.op
    );
  }

  return undefined;
}

/** Positive disc labels only (`eq` / `in`). */
function positiveLabels(match: DiscMatch | undefined): string[] | null {
  if (!match) return null;
  if (match.mode === "eq" || match.mode === "in") return match.values;
  return null;
}

function combineDiscMatches(
  left: DiscMatch | undefined,
  right: DiscMatch | undefined,
  op: "and" | "or"
): DiscMatch | undefined {
  const leftVals = positiveLabels(left);
  const rightVals = positiveLabels(right);
  if (op === "or") {
    if (leftVals && rightVals) {
      return { mode: "in", values: [...new Set([...leftVals, ...rightVals])] };
    }
    if (leftVals) return { mode: "in", values: leftVals };
    if (rightVals) return { mode: "in", values: rightVals };
    return undefined;
  }
  // and: intersection when both sides contribute; otherwise keep the contributing side
  if (leftVals && rightVals) {
    const set = new Set(rightVals);
    return { mode: "in", values: leftVals.filter((v) => set.has(v)) };
  }
  if (leftVals) return { mode: "in", values: leftVals };
  if (rightVals) return { mode: "in", values: rightVals };
  return undefined;
}

function singleStringDisc(
  filter: Expr & { kind: "binary" },
  expected: { kind: "itemRef" | "payloadRef"; binding: string }
): string | undefined {
  const sides: { left: Expr; right: Expr }[] = [
    { left: filter.left, right: filter.right },
    { left: filter.right, right: filter.left },
  ];
  for (const { left, right } of sides) {
    if (
      left.kind === expected.kind &&
      left.binding === expected.binding &&
      left.path.length === 1 &&
      left.path[0] === "type" &&
      right.kind === "literal" &&
      typeof right.value === "string"
    ) {
      return right.value;
    }
  }
  return undefined;
}

function membershipStringDiscs(
  filter: Expr & { kind: "binary" },
  expected: { kind: "itemRef" | "payloadRef"; binding: string }
): string[] | undefined {
  const left = filter.left;
  const right = filter.right;
  if (
    left.kind !== expected.kind ||
    left.binding !== expected.binding ||
    left.path.length !== 1 ||
    left.path[0] !== "type" ||
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
  return values;
}
