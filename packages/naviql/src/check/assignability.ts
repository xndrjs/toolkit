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
 * Scalars compare by name only — representation is never a substitute.
 */
export function typesSemanticallyEqual(a: TypeExpr, b: TypeExpr): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "primitive":
      return b.kind === "primitive" && a.name === b.name;
    case "scalarRef":
      return b.kind === "scalarRef" && a.name === b.name;
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
        if (!other || !typesSemanticallyEqual(field.type, other.type)) {
          return false;
        }
      }
      return true;
    }
  }
}

/**
 * Typed expression assignability (no literal special-case).
 * - Nominal scalars: same name only
 * - No scalar ↔ primitive conversion
 * - T is assignable to nullable T
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
  if (source.kind === "primitive" && target.kind === "primitive") {
    return source.name === target.name;
  }
  if (source.kind === "scalarRef" && target.kind === "scalarRef") {
    return source.name === target.name;
  }
  if (source.kind === "array" && target.kind === "array") {
    return isAssignable(source.of, target.of);
  }
  if (source.kind === "object" && target.kind === "object") {
    return typesSemanticallyEqual(source, target);
  }
  return false;
}

/**
 * Literals may inhabit a scalar when `kind(literal) === representation`.
 * `null` inhabits nullable targets (and only those).
 */
export function literalInhabits(
  value: string | number | boolean | null,
  target: TypeExpr,
  scalarRepresentation: (name: string) => PrimitiveTypeName | undefined
): boolean {
  if (target.kind === "nullable") {
    if (value === null) return true;
    return literalInhabits(value, target.of, scalarRepresentation);
  }
  if (value === null) return false;

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
      return type.name;
    case "nullable":
      return `${formatType(type.of)}?`;
    case "array":
      return `${formatType(type.of)}[]`;
    case "object":
      return `{ ${type.fields.map((f) => `${f.name}: ${formatType(f.type)}`).join(", ")} }`;
  }
}
