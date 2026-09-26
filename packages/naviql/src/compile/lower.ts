/**
 * Lower Langium AST → semantic Program IR.
 *
 * Defaults: `ariType = name`, object-payload shorthand sets
 * `inheritedFromIdentity`, expansions without `each` are multiplicity `"one"`,
 * `each … ( arms )` are `"many"`, scalar `metadata: null`.
 * PathRef is classified here as `param` / `payloadRef` / `itemRef`.
 * Named types resolve to `resourceRef` or `scalarRef` using declaration tables.
 * Do not collapse `scalarRef` / `resourceRef` to structural types.
 */
import { AstUtils, type AstNode } from "langium";

import type {
  Expr,
  Expansion,
  FieldDecl,
  NamedArg,
  PrimitiveTypeName,
  Program,
  ProjectionArm,
  QueryDefinition,
  ResourceConstruction,
  ResourceDefinition,
  ResourceProjection,
  ScalarDefinition,
  SourceSpan,
  TypeExpr,
} from "../ir";
import {
  isArrayTypeExpr,
  isBinaryExpr,
  isBooleanLiteral,
  isContextRef,
  isGroupedTypeExpr,
  isIdentityRef,
  isNamedTypeExpr,
  isNullLiteral,
  isNumberLiteral,
  isObjectTypeExpr,
  isPathRef,
  isPrimitiveTypeExpr,
  isQueryDeclaration,
  isResourceDeclaration,
  isScalarDeclaration,
  isStringLiteral,
  isStringLiteralTypeExpr,
  isTypeProjection,
  isUnionTypeExpr,
  type Expansion as AstExpansion,
  type Expression as AstExpression,
  type Model,
  type NamedArg as AstNamedArg,
  type ObjectField as AstObjectField,
  type ProjectionClause as AstProjectionClause,
  type ProjectionWhenArm as AstProjectionWhenArm,
  type QueryDeclaration as AstQueryDeclaration,
  type ResourceConstruction as AstResourceConstruction,
  type ResourceDeclaration as AstResourceDeclaration,
  type ScalarDeclaration as AstScalarDeclaration,
  type TypeExpr as AstTypeExpr,
  type TypedField as AstTypedField,
} from "../lang/generated/ast";

type NameTables = {
  resources: Set<string>;
  scalars: Set<string>;
};

export function lowerProgram(ast: Model): Program {
  const tables = collectNameTables(ast);
  const scalars: ScalarDefinition[] = [];
  const resources: ResourceDefinition[] = [];
  const queries: QueryDefinition[] = [];

  for (const decl of ast.declarations) {
    if (isScalarDeclaration(decl)) {
      scalars.push(lowerScalar(decl));
    } else if (isResourceDeclaration(decl)) {
      resources.push(lowerResource(decl, tables));
    } else if (isQueryDeclaration(decl)) {
      queries.push(lowerQuery(decl, tables));
    }
  }

  return {
    scalars,
    resources,
    queries,
    span: spanOf(ast),
  };
}

function collectNameTables(ast: Model): NameTables {
  const resources = new Set<string>();
  const scalars = new Set<string>();
  for (const decl of ast.declarations) {
    if (isResourceDeclaration(decl)) resources.add(decl.name);
    else if (isScalarDeclaration(decl)) scalars.add(decl.name);
  }
  return { resources, scalars };
}

function lowerScalar(decl: AstScalarDeclaration): ScalarDefinition {
  return {
    name: decl.name,
    representation: decl.representation,
    metadata: null,
    span: spanOf(decl),
  };
}

function lowerResource(decl: AstResourceDeclaration, tables: NameTables): ResourceDefinition {
  const identity = { fields: decl.identity.map((f) => lowerTypedField(f, tables)) };
  return {
    name: decl.name,
    ariType: decl.name,
    identity,
    payloadType: lowerTypeExpr(decl.payloadType, tables, identity.fields),
    span: spanOf(decl),
  };
}

function lowerQuery(decl: AstQueryDeclaration, tables: NameTables): QueryDefinition {
  return {
    name: decl.name,
    parameters: decl.parameters.map((f) => lowerTypedField(f, tables)),
    context: decl.context ? decl.context.fields.map((f) => lowerTypedField(f, tables)) : [],
    root: lowerConstruction(decl.root.construction),
    projections: decl.projections.map(lowerProjection),
    span: spanOf(decl),
  };
}

function lowerTypedField(field: AstTypedField, tables: NameTables): FieldDecl {
  return {
    name: field.name,
    type: lowerTypeExpr(field.type, tables),
    inheritedFromIdentity: false,
    span: spanOf(field),
  };
}

function lowerObjectField(
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

function lowerTypeExpr(
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

function lowerProjection(clause: AstProjectionClause): ResourceProjection {
  if (clause.whenArms.length > 0) {
    return {
      resource: clause.resource,
      binding: clause.binding,
      selectedFields: [],
      expansions: [],
      arms: clause.whenArms.map(lowerProjectionArm),
      span: spanOf(clause),
    };
  }
  return {
    resource: clause.resource,
    binding: clause.binding,
    selectedFields: [...clause.selectedFields],
    expansions: clause.expansions.map(lowerExpansion),
    arms: null,
    span: spanOf(clause),
  };
}

function lowerProjectionArm(arm: AstProjectionWhenArm): ProjectionArm {
  return {
    when: lowerExpr(arm.when),
    selectedFields: [...arm.selectedFields],
    expansions: arm.expansions.map(lowerExpansion),
    span: spanOf(arm),
  };
}

function lowerExpansion(expansion: AstExpansion): Expansion {
  const each = expansion.each;
  if (each) {
    const itemBindings = new Set([each.itemBinding]);
    return {
      alias: expansion.alias,
      target: null,
      multiplicity: "many",
      comprehension: {
        itemBinding: each.itemBinding,
        source: lowerExpr(each.source, /* itemBindings */ new Set()),
        arms: each.arms.map((arm) => ({
          target: lowerConstruction(arm.target, itemBindings),
          when: arm.when ? lowerExpr(arm.when, itemBindings) : null,
        })),
      },
      span: spanOf(expansion),
    };
  }
  if (!expansion.target) {
    throw new Error("lowerExpansion: one-expand missing target construction");
  }
  return {
    alias: expansion.alias,
    target: lowerConstruction(expansion.target),
    multiplicity: "one",
    comprehension: null,
    span: spanOf(expansion),
  };
}

function lowerConstruction(
  construction: AstResourceConstruction,
  itemBindings = new Set<string>()
): ResourceConstruction {
  return {
    resource: construction.resource,
    args: construction.args.map((a) => lowerNamedArg(a, itemBindings)),
    span: spanOf(construction),
  };
}

function lowerNamedArg(arg: AstNamedArg, itemBindings = new Set<string>()): NamedArg {
  return {
    name: arg.name,
    value: lowerExpr(arg.value, itemBindings),
    span: spanOf(arg),
  };
}

function lowerExpr(expr: AstExpression, itemBindings = new Set<string>()): Expr {
  const span = spanOf(expr);

  if (isBinaryExpr(expr)) {
    return {
      kind: "binary",
      op: expr.op,
      left: lowerExpr(expr.left, itemBindings),
      right: lowerExpr(expr.right, itemBindings),
      span,
    };
  }

  if (isStringLiteral(expr)) {
    return { kind: "literal", value: expr.value, span };
  }
  if (isNumberLiteral(expr)) {
    return { kind: "literal", value: Number(expr.value), span };
  }
  if (isBooleanLiteral(expr)) {
    return { kind: "literal", value: expr.value === "true", span };
  }
  if (isNullLiteral(expr)) {
    return { kind: "literal", value: null, span };
  }
  if (isContextRef(expr)) {
    return { kind: "context", path: [...expr.path], span };
  }
  if (isIdentityRef(expr)) {
    return {
      kind: "identityRef",
      binding: expr.binding,
      path: [...expr.path],
      span,
    };
  }
  if (isPathRef(expr)) {
    const head = expr.segments[0] ?? "";
    if (itemBindings.has(head)) {
      return {
        kind: "itemRef",
        binding: head,
        path: expr.segments.slice(1),
        span,
      };
    }
    if (expr.segments.length <= 1) {
      return { kind: "param", name: head, span };
    }
    return {
      kind: "payloadRef",
      binding: head,
      path: expr.segments.slice(1),
      span,
    };
  }

  const _never: never = expr;
  return _never;
}

function cloneTypeExpr(type: TypeExpr): TypeExpr {
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

function spanOf(node: AstNode): SourceSpan | null {
  const cst = node.$cstNode;
  if (!cst) return null;

  let uri: string | null = null;
  try {
    uri = AstUtils.getDocument(node).uri.toString();
  } catch {
    uri = null;
  }

  return {
    start: cst.offset,
    end: cst.end,
    uri,
  };
}
