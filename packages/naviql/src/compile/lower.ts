/**
 * Lower Langium AST → semantic Program IR.
 *
 * Defaults match Phase 1 fixtures: `ariType = name`, payload shorthand sets
 * `inheritedFromIdentity`, expansions are multiplicity `"one"`, scalar
 * `metadata: null`. PathRef is classified here as `param` vs `payloadRef`.
 * Do not collapse `scalarRef` → `primitive`.
 */
import { AstUtils, type AstNode } from "langium";

import type {
  Expr,
  Expansion,
  FieldDecl,
  NamedArg,
  PrimitiveTypeName,
  Program,
  QueryDefinition,
  ResourceConstruction,
  ResourceDefinition,
  ResourceProjection,
  ScalarDefinition,
  SourceSpan,
  TypeExpr,
} from "../ir";
import {
  isBooleanLiteral,
  isContextRef,
  isIdentityRef,
  isNullLiteral,
  isNumberLiteral,
  isPathRef,
  isPrimitiveTypeExpr,
  isQueryDeclaration,
  isResourceDeclaration,
  isScalarDeclaration,
  isScalarTypeExpr,
  isStringLiteral,
  type Expansion as AstExpansion,
  type Expression as AstExpression,
  type Model,
  type NamedArg as AstNamedArg,
  type PayloadField as AstPayloadField,
  type ProjectionClause as AstProjectionClause,
  type QueryDeclaration as AstQueryDeclaration,
  type ResourceConstruction as AstResourceConstruction,
  type ResourceDeclaration as AstResourceDeclaration,
  type ScalarDeclaration as AstScalarDeclaration,
  type TypeExpr as AstTypeExpr,
  type TypedField as AstTypedField,
} from "../lang/generated/ast";

export function lowerProgram(ast: Model): Program {
  const scalars: ScalarDefinition[] = [];
  const resources: ResourceDefinition[] = [];
  const queries: QueryDefinition[] = [];

  for (const decl of ast.declarations) {
    if (isScalarDeclaration(decl)) {
      scalars.push(lowerScalar(decl));
    } else if (isResourceDeclaration(decl)) {
      resources.push(lowerResource(decl));
    } else if (isQueryDeclaration(decl)) {
      queries.push(lowerQuery(decl));
    }
  }

  return {
    scalars,
    resources,
    queries,
    span: spanOf(ast),
  };
}

function lowerScalar(decl: AstScalarDeclaration): ScalarDefinition {
  return {
    name: decl.name,
    representation: decl.representation,
    metadata: null,
    span: spanOf(decl),
  };
}

function lowerResource(decl: AstResourceDeclaration): ResourceDefinition {
  const identity = { fields: decl.identity.map(lowerTypedField) };
  const payload = {
    fields: decl.payload.map((field) => lowerPayloadField(field, identity.fields)),
  };
  return {
    name: decl.name,
    ariType: decl.name,
    identity,
    payload,
    span: spanOf(decl),
  };
}

function lowerQuery(decl: AstQueryDeclaration): QueryDefinition {
  return {
    name: decl.name,
    parameters: decl.parameters.map(lowerTypedField),
    context: decl.context ? decl.context.fields.map(lowerTypedField) : [],
    root: lowerConstruction(decl.root.construction),
    projections: decl.projections.map(lowerProjection),
    span: spanOf(decl),
  };
}

function lowerTypedField(field: AstTypedField): FieldDecl {
  return {
    name: field.name,
    type: lowerTypeExpr(field.type),
    inheritedFromIdentity: false,
    span: spanOf(field),
  };
}

function lowerPayloadField(field: AstPayloadField, identityFields: FieldDecl[]): FieldDecl {
  if (!field.type) {
    const identity = identityFields.find((f) => f.name === field.name);
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
    type: lowerTypeExpr(field.type),
    inheritedFromIdentity: false,
    span: spanOf(field),
  };
}

function lowerTypeExpr(type: AstTypeExpr): TypeExpr {
  if (isPrimitiveTypeExpr(type)) {
    return {
      kind: "primitive",
      name: type.name as PrimitiveTypeName,
      span: spanOf(type),
    };
  }
  if (isScalarTypeExpr(type)) {
    return {
      kind: "scalarRef",
      name: type.name,
      span: spanOf(type),
    };
  }
  // Exhaustiveness guard for generated union
  const _never: never = type;
  return _never;
}

function lowerProjection(clause: AstProjectionClause): ResourceProjection {
  return {
    resource: clause.resource,
    binding: clause.binding,
    selectedFields: [...clause.selectedFields],
    expansions: clause.expansions.map(lowerExpansion),
    span: spanOf(clause),
  };
}

function lowerExpansion(expansion: AstExpansion): Expansion {
  return {
    alias: expansion.alias,
    target: lowerConstruction(expansion.target),
    multiplicity: "one",
    span: spanOf(expansion),
  };
}

function lowerConstruction(construction: AstResourceConstruction): ResourceConstruction {
  return {
    resource: construction.resource,
    args: construction.args.map(lowerNamedArg),
    span: spanOf(construction),
  };
}

function lowerNamedArg(arg: AstNamedArg): NamedArg {
  return {
    name: arg.name,
    value: lowerExpr(arg.value),
    span: spanOf(arg),
  };
}

function lowerExpr(expr: AstExpression): Expr {
  const span = spanOf(expr);

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
    // Single segment → query param; `binding.path…` → payloadRef.
    if (expr.segments.length <= 1) {
      return { kind: "param", name: expr.segments[0] ?? "", span };
    }
    return {
      kind: "payloadRef",
      binding: expr.segments[0]!,
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
  }
}

function spanOf(node: AstNode): SourceSpan | null {
  const cst = node.$cstNode;
  if (!cst) return null;

  let uri: string | null = null;
  try {
    uri = AstUtils.getDocument(node).uri.toString();
  } catch {
    // Direct `parser.parse` ASTs are not attached to a LangiumDocument.
    uri = null;
  }

  return {
    start: cst.offset,
    end: cst.end,
    uri,
  };
}
