import type { PrimitiveTypeName, TypeExpr } from "../ir";

const PRIMITIVES = new Set<PrimitiveTypeName>(["string", "number", "boolean"]);

export function isPrimitiveTypeName(name: string): name is PrimitiveTypeName {
  return PRIMITIVES.has(name as PrimitiveTypeName);
}

export function literalKind(value: string | number | boolean | null): PrimitiveTypeName | "null" {
  if (value === null) return "null";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  return "boolean";
}

/**
 * Strict nominal equality of semantic types.
 * Scalars and resources compare by name only — representation is never a substitute.
 * Unions compare as unordered member sets.
 */
export function typesSemanticallyEqual(a: TypeExpr, b: TypeExpr): boolean {
  if (a.kind === "union" || b.kind === "union") {
    if (a.kind !== "union" || b.kind !== "union") return false;
    if (a.members.length !== b.members.length) return false;
    const unmatched = [...b.members];
    for (const member of a.members) {
      const idx = unmatched.findIndex((other) => typesSemanticallyEqual(member, other));
      if (idx < 0) return false;
      unmatched.splice(idx, 1);
    }
    return true;
  }
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "primitive":
      return b.kind === "primitive" && a.name === b.name;
    case "scalarRef":
      return b.kind === "scalarRef" && a.name === b.name;
    case "opaqueRef":
      return b.kind === "opaqueRef" && a.name === b.name;
    case "resourceRef":
      return b.kind === "resourceRef" && a.name === b.name;
    case "unresolvedNamedRef":
      return b.kind === "unresolvedNamedRef" && a.name === b.name;
    case "stringLiteral":
      return b.kind === "stringLiteral" && a.value === b.value;
    case "null":
      return b.kind === "null";
    case "nullable":
      return b.kind === "nullable" && typesSemanticallyEqual(a.of, b.of);
    case "array":
      return b.kind === "array" && typesSemanticallyEqual(a.of, b.of);
    case "object": {
      if (b.kind !== "object") return false;
      if (a.fields.length !== b.fields.length) return false;
      const bByName = new Map(b.fields.map((f) => [f.name, f]));
      for (const field of a.fields) {
        const other = bByName.get(field.name);
        if (
          !other ||
          field.optional !== other.optional ||
          !typesSemanticallyEqual(field.type, other.type)
        ) {
          return false;
        }
      }
      return true;
    }
    case "typeProjection":
      return b.kind === "typeProjection" && a.resource === b.resource && a.field === b.field;
  }
}

/**
 * Typed expression assignability (no literal special-case).
 * - Nominal scalars / resources: same name only
 * - No scalar ↔ primitive / resource ↔ object conversion
 * - T is assignable to nullable T
 * - Unions: distributive
 */
export function isAssignable(source: TypeExpr, target: TypeExpr): boolean {
  if (target.kind === "nullable") {
    if (source.kind === "nullable") {
      return isAssignable(source.of, target.of);
    }
    return isAssignable(source, target.of);
  }
  if (source.kind === "nullable") {
    return false;
  }
  if (target.kind === "union") {
    return target.members.some((member) => isAssignable(source, member));
  }
  if (source.kind === "union") {
    return source.members.every((member) => isAssignable(member, target));
  }
  if (source.kind === "primitive" && target.kind === "primitive") {
    return source.name === target.name;
  }
  if (source.kind === "scalarRef" && target.kind === "scalarRef") {
    return source.name === target.name;
  }
  if (source.kind === "opaqueRef" && target.kind === "opaqueRef") {
    return source.name === target.name;
  }
  if (source.kind === "resourceRef" && target.kind === "resourceRef") {
    return source.name === target.name;
  }
  if (source.kind === "stringLiteral" && target.kind === "stringLiteral") {
    return source.value === target.value;
  }
  if (source.kind === "stringLiteral" && target.kind === "primitive" && target.name === "string") {
    return true;
  }
  if (source.kind === "array" && target.kind === "array") {
    return isAssignable(source.of, target.of);
  }
  if (source.kind === "object" && target.kind === "object") {
    return typesSemanticallyEqual(source, target);
  }
  // Unresolved projections are not assignable; callers should resolve first.
  return false;
}

export function literalInhabits(
  value: string | number | boolean | null,
  target: TypeExpr,
  scalarRepresentation: (name: string) => PrimitiveTypeName | undefined
): boolean {
  if (target.kind === "nullable") {
    if (value === null) return true;
    return literalInhabits(value, target.of, scalarRepresentation);
  }
  if (target.kind === "union") {
    return target.members.some((member) => literalInhabits(value, member, scalarRepresentation));
  }
  if (value === null) return false;

  if (target.kind === "stringLiteral") {
    return typeof value === "string" && value === target.value;
  }

  // Resource instances / opaques / structures / unresolved names are not inhabited by raw literals.
  if (
    target.kind === "resourceRef" ||
    target.kind === "opaqueRef" ||
    target.kind === "unresolvedNamedRef" ||
    target.kind === "array" ||
    target.kind === "object" ||
    target.kind === "typeProjection"
  ) {
    return false;
  }

  const kind = literalKind(value);
  if (kind === "null") return false;

  if (target.kind === "primitive") {
    return target.name === kind;
  }
  if (target.kind === "scalarRef") {
    const representation = scalarRepresentation(target.name);
    return representation !== undefined && representation === kind;
  }
  return false;
}

export function formatType(type: TypeExpr): string {
  switch (type.kind) {
    case "primitive":
      return type.name;
    case "scalarRef":
    case "opaqueRef":
    case "resourceRef":
    case "unresolvedNamedRef":
      return type.name;
    case "stringLiteral":
      return JSON.stringify(type.value);
    case "null":
      return "null";
    case "nullable":
      return `${formatType(type.of)} | null`;
    case "array": {
      const inner = formatType(type.of);
      return type.of.kind === "union" || type.of.kind === "nullable"
        ? `(${inner})[]`
        : `${inner}[]`;
    }
    case "object":
      return `{ ${type.fields
        .map((f) => `${f.name}${f.optional ? "?" : ""}: ${formatType(f.type)}`)
        .join(", ")} }`;
    case "union":
      return type.members.map(formatType).join(" | ");
    case "typeProjection":
      return `${type.resource}.${type.field}`;
  }
}

/** Object payload fields when `payloadType` is an object; otherwise empty. */
export function objectPayloadFields(payloadType: TypeExpr): import("../ir").FieldDecl[] {
  return payloadType.kind === "object" ? payloadType.fields : [];
}
