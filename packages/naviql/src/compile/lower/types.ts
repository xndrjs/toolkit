import type { FieldDecl, PrimitiveTypeName, TypeExpr } from "../../ir";
import {
  isArrayTypeExpr,
  isGroupedTypeExpr,
  isNamedTypeExpr,
  isObjectTypeExpr,
  isPrimitiveTypeExpr,
  isStringLiteralTypeExpr,
  isTypeProjection,
  isUnionTypeExpr,
  type ObjectField as AstObjectField,
  type TypeExpr as AstTypeExpr,
  type TypedField as AstTypedField,
} from "../../lang/generated/ast";
import { spanOf } from "./span";

export type NameTables = {
  resources: Set<string>;
  scalars: Set<string>;
};

export function lowerTypedField(field: AstTypedField, tables: NameTables): FieldDecl {
  return {
    name: field.name,
    type: lowerTypeExpr(field.type, tables),
    inheritedFromIdentity: false,
    span: spanOf(field),
  };
}

export function lowerObjectField(
  field: AstObjectField,
  tables: NameTables,
  identityFields: FieldDecl[] | null
): FieldDecl {
  if (!field.type) {
    const identity = identityFields?.find((f) => f.name === field.name);
    return {
      name: field.name,
      type: identity
        ? cloneTypeExpr(identity.type)
        : { kind: "primitive", name: "string", span: spanOf(field) },
      inheritedFromIdentity: true,
      span: spanOf(field),
    };
  }
  return {
    name: field.name,
    type: lowerTypeExpr(field.type, tables),
    inheritedFromIdentity: false,
    span: spanOf(field),
  };
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
    return {
      kind: "union",
      members,
      span: spanOf(type),
    };
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
    if (tables.resources.has(type.name)) {
      return { kind: "resourceRef", name: type.name, span: spanOf(type) };
    }
    return { kind: "scalarRef", name: type.name, span: spanOf(type) };
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
    case "resourceRef":
      return { kind: "resourceRef", name: type.name, span: type.span };
    case "stringLiteral":
      return { kind: "stringLiteral", value: type.value, span: type.span };
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
          inheritedFromIdentity: f.inheritedFromIdentity,
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
