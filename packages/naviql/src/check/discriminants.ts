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

/**
 * If `filter` is `item.type == "Lit"` (or `!=`) against a union of objects that
 * carry a `type` stringLiteral discriminant, return the matching member(s).
 */
export function narrowItemTypeByFilter(
  elementType: TypeExpr,
  filter: Expr,
  itemBinding: string
): TypeExpr | undefined {
  if (filter.kind !== "binary" || (filter.op !== "==" && filter.op !== "!=")) {
    return undefined;
  }

  const disc = itemDiscriminantLiteral(filter, itemBinding);
  if (!disc) return undefined;

  const members =
    elementType.kind === "union"
      ? elementType.members
      : elementType.kind === "object"
        ? [elementType]
        : null;
  if (!members) return undefined;

  const matched = members.filter((member) => {
    if (member.kind !== "object") return false;
    const typeField = member.fields.find((f) => f.name === "type");
    if (!typeField || typeField.type.kind !== "stringLiteral") return false;
    const eq = typeField.type.value === disc.value;
    return filter.op === "==" ? eq : !eq;
  });

  if (matched.length === 0) return undefined;
  if (matched.length === 1) return matched[0];
  return { kind: "union", members: matched, span: null };
}

/**
 * Narrow a resource payload via `binding.type == "Lit"` (or `!=`), expanding
 * resourceRef union members to their object payloads.
 */
export function narrowPayloadByFilter(
  payloadType: TypeExpr,
  filter: Expr,
  binding: string,
  resources: ResourceTable
): TypeExpr | undefined {
  if (filter.kind !== "binary" || (filter.op !== "==" && filter.op !== "!=")) {
    return undefined;
  }

  const disc = payloadDiscriminantLiteral(filter, binding);
  if (!disc) return undefined;

  const members = expandPayloadObjectMembers(payloadType, resources);
  if (!members) return undefined;

  const matched = members.filter((member) => {
    const typeField = member.fields.find((f) => f.name === "type");
    if (!typeField || typeField.type.kind !== "stringLiteral") return false;
    const eq = typeField.type.value === disc.value;
    return filter.op === "==" ? eq : !eq;
  });

  if (matched.length === 0) return undefined;
  if (matched.length === 1) return matched[0];
  return { kind: "union", members: matched, span: null };
}

export function itemDiscriminantLiteral(
  filter: Expr & { kind: "binary" },
  itemBinding: string
): { value: string } | undefined {
  return discriminantLiteral(filter, {
    kind: "itemRef",
    binding: itemBinding,
  });
}

export function payloadDiscriminantLiteral(
  filter: Expr & { kind: "binary" },
  binding: string
): { value: string } | undefined {
  return discriminantLiteral(filter, {
    kind: "payloadRef",
    binding,
  });
}

function discriminantLiteral(
  filter: Expr & { kind: "binary" },
  expected: { kind: "itemRef" | "payloadRef"; binding: string }
): { value: string } | undefined {
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
      return { value: right.value };
    }
  }
  return undefined;
}
