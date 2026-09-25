import type {
  Expr,
  Expansion,
  FieldDecl,
  NamedArg,
  PrimitiveTypeName,
  QueryDefinition,
  ResourceConstruction,
  ResourceDefinition,
  ResourceProjection,
  ScalarDefinition,
  TypeExpr,
} from "../compile";

export const span = null;

export function prim(name: PrimitiveTypeName): TypeExpr {
  return { kind: "primitive", name, span };
}

export function scalarRef(name: string): TypeExpr {
  return { kind: "scalarRef", name, span };
}

export function resourceRef(name: string): TypeExpr {
  return { kind: "resourceRef", name, span };
}

export function typeProj(resource: string, field: string): TypeExpr {
  return { kind: "typeProjection", resource, field, span };
}

export function strLit(value: string): TypeExpr {
  return { kind: "stringLiteral", value, span };
}

export function arrayOf(of: TypeExpr): TypeExpr {
  return { kind: "array", of, span };
}

export function objectType(...fields: FieldDecl[]): TypeExpr {
  return { kind: "object", fields, span };
}

export function union(...members: TypeExpr[]): TypeExpr {
  return { kind: "union", members, span };
}

export function field(name: string, type: TypeExpr, inheritedFromIdentity = false): FieldDecl {
  return { name, type, inheritedFromIdentity, span };
}

export function defScalar(name: string, representation: PrimitiveTypeName): ScalarDefinition {
  return { name, representation, metadata: null, span };
}

export function resource(
  name: string,
  identity: FieldDecl[],
  payloadType: TypeExpr
): ResourceDefinition {
  return {
    name,
    ariType: name,
    identity: { fields: identity },
    payloadType,
    span,
  };
}

export function arg(name: string, value: Expr): NamedArg {
  return { name, value, span };
}

export function construct(resourceName: string, args: NamedArg[]): ResourceConstruction {
  return { resource: resourceName, args, span };
}

export function expand(
  alias: string,
  target: ResourceConstruction,
  comprehension: Expansion["comprehension"] = null
): Expansion {
  if (comprehension) {
    return {
      alias,
      target: null,
      multiplicity: "many",
      comprehension,
      span,
    };
  }
  return {
    alias,
    target,
    multiplicity: "one",
    comprehension: null,
    span,
  };
}

/** Many-expand helper: `each item in source ( arms )`. */
export function expandEach(
  alias: string,
  itemBinding: string,
  source: Expr,
  arms: { target: ResourceConstruction; when?: Expr | null }[]
): Expansion {
  return {
    alias,
    target: null,
    multiplicity: "many",
    comprehension: {
      itemBinding,
      source,
      arms: arms.map((arm) => ({
        target: arm.target,
        when: arm.when ?? null,
      })),
    },
    span,
  };
}

export function item(binding: string, ...path: string[]): Expr {
  return { kind: "itemRef", binding, path, span };
}

export function projection(
  resourceName: string,
  binding: string,
  selectedFields: string[],
  expansions: Expansion[] = []
): ResourceProjection {
  return {
    resource: resourceName,
    binding,
    selectedFields,
    expansions,
    span,
  };
}

export function query(
  name: string,
  partial: Omit<QueryDefinition, "name" | "span">
): QueryDefinition {
  return { name, span, ...partial };
}

export function lit(value: string | number | boolean | null): Expr {
  return { kind: "literal", value, span };
}

export function eq(left: Expr, right: Expr): Expr {
  return { kind: "binary", op: "==", left, right, span };
}

export function ne(left: Expr, right: Expr): Expr {
  return { kind: "binary", op: "!=", left, right, span };
}

export function param(name: string): Expr {
  return { kind: "param", name, span };
}

export function ctx(...path: string[]): Expr {
  return { kind: "context", path, span };
}

export function payload(binding: string, ...path: string[]): Expr {
  return { kind: "payloadRef", binding, path, span };
}

export function identity(binding: string, ...path: string[]): Expr {
  return { kind: "identityRef", binding, path, span };
}
