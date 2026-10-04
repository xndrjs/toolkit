import type {
  FieldDecl,
  PrimitiveTypeName,
  RefersPatternField,
  RefersTarget,
  TypeExpr,
} from "../../ir";
import {
  isArrayTypeExpr,
  isGroupedTypeExpr,
  isNamedTypeExpr,
  isNullTypeExpr,
  isObjectTypeExpr,
  isPrimitiveTypeExpr,
  isStringLiteralTypeExpr,
  isTypeProjection,
  isUnionTypeExpr,
  type ObjectField as AstObjectField,
  type RefersClause as AstRefersClause,
  type RefersPatternField as AstRefersPatternField,
  type RefersTarget as AstRefersTarget,
  type TypeExpr as AstTypeExpr,
  type TypedField as AstTypedField,
} from "../../lang/generated/ast";
import { spanOf } from "./span";

export type NameTables = {
  resources: Set<string>;
  scalars: Set<string>;
  opaques: Set<string>;
};

function lowerRefersPatternField(field: AstRefersPatternField): RefersPatternField {
  return {
    name: field.name,
    values: [...field.values],
    span: spanOf(field),
  };
}

function lowerRefersTarget(target: AstRefersTarget): RefersTarget {
  return {
    resource: target.resource,
    fields: target.fields.map(lowerRefersPatternField),
    span: spanOf(target),
  };
}

function lowerRefersClause(clause: AstRefersClause | undefined): RefersTarget[] | null {
  if (!clause) return null;
  return clause.targets.map(lowerRefersTarget);
}

export function lowerTypedField(field: AstTypedField, tables: NameTables): FieldDecl {
  return {
    name: field.name,
    type: lowerTypeExpr(field.type, tables),
    optional: false,
    inheritedFromIdentity: false,
    refers: null,
    span: spanOf(field),
  };
}

export function lowerObjectField(
  field: AstObjectField,
  tables: NameTables,
  identityFields: FieldDecl[] | null
): FieldDecl {
  const refers = lowerRefersClause(field.refers);
  const optional = field.optional === true;
  if (!field.type) {
    const identity = identityFields?.find((f) => f.name === field.name);
    return {
      name: field.name,
      type: identity
        ? cloneTypeExpr(identity.type)
        : { kind: "primitive", name: "string", span: spanOf(field) },
      optional,
      inheritedFromIdentity: true,
      refers,
      span: spanOf(field),
    };
  }
  return {
    name: field.name,
    type: lowerTypeExpr(field.type, tables),
    optional,
    inheritedFromIdentity: false,
    refers,
    span: spanOf(field),
  };
}

/**
 * Collapse `T | null | …` into `{ kind: "nullable", of: … }`.
 * Bare `null` (or `null | null`) survives as `{ kind: "null" }` for check.
 */
function normalizeNullability(type: TypeExpr): TypeExpr {
  if (type.kind !== "union") return type;

  const nonNull: TypeExpr[] = [];
  let sawNull = false;
  for (const member of type.members) {
    if (member.kind === "null") {
      sawNull = true;
      continue;
    }
    if (member.kind === "nullable") {
      sawNull = true;
      if (member.of.kind === "union") {
        nonNull.push(...member.of.members);
      } else {
        nonNull.push(member.of);
      }
      continue;
    }
    nonNull.push(member);
  }

  if (!sawNull) {
    return type;
  }
  if (nonNull.length === 0) {
    return { kind: "null", span: type.span };
  }
  const of: TypeExpr =
    nonNull.length === 1 ? nonNull[0]! : { kind: "union", members: nonNull, span: type.span };
  return { kind: "nullable", of, span: type.span };
}

export function lowerTypeExpr(
  type: AstTypeExpr,
  tables: NameTables,
  /** When lowering a resource's root object payload, resolve bare-field shorthand. */
  identityFields: FieldDecl[] | null = null
): TypeExpr {
  if (isUnionTypeExpr(type)) {
    const members = type.members.flatMap((member) => {
      const lowered = lowerTypeExpr(member as AstTypeExpr, tables, identityFields);
      return lowered.kind === "union" ? lowered.members : [lowered];
    });
    return normalizeNullability({
      kind: "union",
      members,
      span: spanOf(type),
    });
  }
  if (isArrayTypeExpr(type)) {
    return {
      kind: "array",
      of: lowerTypeExpr(type.of as AstTypeExpr, tables),
      span: spanOf(type),
    };
  }
  if (isGroupedTypeExpr(type)) {
    return lowerTypeExpr(type.type, tables, identityFields);
  }
  if (isObjectTypeExpr(type)) {
    return {
      kind: "object",
      fields: type.fields.map((f) => lowerObjectField(f, tables, identityFields)),
      span: spanOf(type),
    };
  }
  if (isStringLiteralTypeExpr(type)) {
    return {
      kind: "stringLiteral",
      value: type.value,
      span: spanOf(type),
    };
  }
  if (isNullTypeExpr(type)) {
    return { kind: "null", span: spanOf(type) };
  }
  if (isPrimitiveTypeExpr(type)) {
    return {
      kind: "primitive",
      name: type.name as PrimitiveTypeName,
      span: spanOf(type),
    };
  }
  if (isTypeProjection(type)) {
    return {
      kind: "typeProjection",
      resource: type.resource,
      field: type.field,
      span: spanOf(type),
    };
  }
  if (isNamedTypeExpr(type)) {
    // Deterministic order: resource → scalar → opaque → unresolved.
    // Name clashes are rejected later by check; lowering only needs a stable choice.
    if (tables.resources.has(type.name)) {
      return { kind: "resourceRef", name: type.name, span: spanOf(type) };
    }
    if (tables.scalars.has(type.name)) {
      return { kind: "scalarRef", name: type.name, span: spanOf(type) };
    }
    if (tables.opaques.has(type.name)) {
      return { kind: "opaqueRef", name: type.name, span: spanOf(type) };
    }
    return { kind: "unresolvedNamedRef", name: type.name, span: spanOf(type) };
  }
  const _never: never = type;
  return _never;
}

export function cloneTypeExpr(type: TypeExpr): TypeExpr {
  switch (type.kind) {
    case "primitive":
      return { kind: "primitive", name: type.name, span: type.span };
    case "scalarRef":
      return { kind: "scalarRef", name: type.name, span: type.span };
    case "opaqueRef":
      return { kind: "opaqueRef", name: type.name, span: type.span };
    case "resourceRef":
      return { kind: "resourceRef", name: type.name, span: type.span };
    case "unresolvedNamedRef":
      return { kind: "unresolvedNamedRef", name: type.name, span: type.span };
    case "stringLiteral":
      return { kind: "stringLiteral", value: type.value, span: type.span };
    case "null":
      return { kind: "null", span: type.span };
    case "nullable":
      return { kind: "nullable", of: cloneTypeExpr(type.of), span: type.span };
    case "array":
      return { kind: "array", of: cloneTypeExpr(type.of), span: type.span };
    case "object":
      return {
        kind: "object",
        fields: type.fields.map((f) => ({
          name: f.name,
          type: cloneTypeExpr(f.type),
          optional: f.optional,
          inheritedFromIdentity: f.inheritedFromIdentity,
          refers: f.refers
            ? f.refers.map((t) => ({
                resource: t.resource,
                fields: t.fields.map((pf) => ({
                  name: pf.name,
                  values: [...pf.values],
                  span: pf.span,
                })),
                span: t.span,
              }))
            : null,
          span: f.span,
        })),
        span: type.span,
      };
    case "union":
      return {
        kind: "union",
        members: type.members.map(cloneTypeExpr),
        span: type.span,
      };
    case "typeProjection":
      return {
        kind: "typeProjection",
        resource: type.resource,
        field: type.field,
        span: type.span,
      };
  }
}
