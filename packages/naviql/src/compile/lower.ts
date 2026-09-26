/**
 * Lower Langium AST → semantic Program IR.
 *
 * Defaults: `ariType = name`, object-payload shorthand sets
 * `inheritedFromIdentity`, expansions without `each` are multiplicity `"one"`,
 * `each … ( arms )` are `"many"`, scalar `metadata: null`.
 * PathRef is classified here as `param` / `payloadRef` / `itemRef`.
 * Named types resolve to `resourceRef` or `scalarRef` using declaration tables.
 * Do not collapse `scalarRef` / `resourceRef` to structural types.
 *
 * Fragments and on-level preambles desugar here: spreads expand with binding
 * rewrite, preamble fields/expansions distribute into every when-arm. IR stays
 * flat (no fragment / preamble nodes).
 */
import { AstUtils, isCompositeCstNode, type AstNode } from "langium";

import type {
  Expr,
  Expansion,
  FieldDecl,
  NamedArg,
  PrimitiveTypeName,
  Program,
  ProjectionArm,
  QueryDefinition,
  ResolveArm,
  ResourceConstruction,
  ResourceDefinition,
  ResourceProjection,
  ScalarDefinition,
  SourceSpan,
  TypeExpr,
} from "../ir";
import { createDiagnosticSink, type Diagnostic, type DiagnosticSink } from "../check/diagnostic";
import {
  isArrayTypeExpr,
  isBinaryExpr,
  isBooleanLiteral,
  isContextRef,
  isFragmentDeclaration,
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
  type FragmentDeclaration as AstFragmentDeclaration,
  type FragmentSpread as AstFragmentSpread,
  type Model,
  type NamedArg as AstNamedArg,
  type ObjectField as AstObjectField,
  type ProjectionClause as AstProjectionClause,
  type ProjectionWhenArm as AstProjectionWhenArm,
  type QueryDeclaration as AstQueryDeclaration,
  type ResolveArm as AstResolveArm,
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

type FragmentTable = Map<string, AstFragmentDeclaration>;

type FlattenedBody = {
  selectedFields: string[];
  expansions: Expansion[];
};

type BodyItem =
  | { kind: "field"; name: string }
  | { kind: "expansion"; expansion: AstExpansion }
  | { kind: "spread"; spread: AstFragmentSpread };

type BodyContainer = {
  selectedFields: string[];
  expansions: AstExpansion[];
  spreads: AstFragmentSpread[];
  $cstNode?: AstNode["$cstNode"];
};

const EMPTY_BODY: FlattenedBody = { selectedFields: [], expansions: [] };

/**
 * Lower a Model AST to Program IR.
 * Fragment/preamble diagnostics are pushed to `sink` (created if omitted).
 */
export function lowerProgram(ast: Model, sink: DiagnosticSink = createDiagnosticSink()): Program {
  const tables = collectNameTables(ast);
  const fragments = collectFragments(ast, sink);
  const scalars: ScalarDefinition[] = [];
  const resources: ResourceDefinition[] = [];
  const queries: QueryDefinition[] = [];

  for (const decl of ast.declarations) {
    if (isScalarDeclaration(decl)) {
      scalars.push(lowerScalar(decl));
    } else if (isResourceDeclaration(decl)) {
      resources.push(lowerResource(decl, tables));
    } else if (isQueryDeclaration(decl)) {
      queries.push(lowerQuery(decl, tables, fragments, sink));
    }
  }

  return {
    scalars,
    resources,
    queries,
    span: spanOf(ast),
  };
}

/** Codes emitted only during fragment/preamble desugar (not by checkProgram). */
export const LOWER_DIAGNOSTIC_CODES = new Set([
  "UNKNOWN_FRAGMENT",
  "FRAGMENT_RESOURCE_MISMATCH",
  "FRAGMENT_CYCLE",
  "DUPLICATE_FRAGMENT",
  "DUPLICATE_SELECTED_FIELD",
]);

export function isLowerDiagnostic(diagnostic: Pick<Diagnostic, "code">): boolean {
  return LOWER_DIAGNOSTIC_CODES.has(diagnostic.code);
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

function collectFragments(ast: Model, sink: DiagnosticSink): FragmentTable {
  const fragments: FragmentTable = new Map();
  for (const decl of ast.declarations) {
    if (!isFragmentDeclaration(decl)) continue;
    if (fragments.has(decl.name)) {
      sink.push({
        code: "DUPLICATE_FRAGMENT",
        message: `Duplicate fragment '${decl.name}'`,
        span: spanOf(decl),
      });
      continue;
    }
    fragments.set(decl.name, decl);
  }
  return fragments;
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

function lowerQuery(
  decl: AstQueryDeclaration,
  tables: NameTables,
  fragments: FragmentTable,
  sink: DiagnosticSink
): QueryDefinition {
  return {
    name: decl.name,
    parameters: decl.parameters.map((f) => lowerTypedField(f, tables)),
    context: decl.context ? decl.context.fields.map((f) => lowerTypedField(f, tables)) : [],
    root: lowerConstruction(decl.root.construction),
    projections: decl.projections.map((p) => lowerProjection(p, fragments, sink)),
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

function lowerProjection(
  clause: AstProjectionClause,
  fragments: FragmentTable,
  sink: DiagnosticSink
): ResourceProjection {
  if (clause.resolveArms.length > 0) {
    return {
      resource: clause.resource,
      binding: clause.binding,
      selectedFields: [],
      expansions: [],
      arms: null,
      resolveArms: clause.resolveArms.map(lowerResolveArm),
      span: spanOf(clause),
    };
  }

  const preamble = expandBody(clause, clause.resource, clause.binding, fragments, [], sink);

  if (clause.whenArms.length > 0) {
    const arms = clause.whenArms.map((arm) =>
      lowerProjectionArm(arm, clause.resource, clause.binding, preamble, fragments, sink)
    );
    return {
      resource: clause.resource,
      binding: clause.binding,
      selectedFields: [],
      expansions: [],
      arms,
      resolveArms: null,
      span: spanOf(clause),
    };
  }

  rejectDuplicateBody(preamble, spanOf(clause), sink);
  return {
    resource: clause.resource,
    binding: clause.binding,
    selectedFields: preamble.selectedFields,
    expansions: preamble.expansions,
    arms: null,
    resolveArms: null,
    span: spanOf(clause),
  };
}

function lowerResolveArm(arm: AstResolveArm): ResolveArm {
  return {
    target: lowerConstruction(arm.target),
    when: arm.when ? lowerExpr(arm.when) : null,
    span: spanOf(arm),
  };
}

function lowerProjectionArm(
  arm: AstProjectionWhenArm,
  resource: string,
  binding: string,
  preamble: FlattenedBody,
  fragments: FragmentTable,
  sink: DiagnosticSink
): ProjectionArm {
  const armBody = expandBody(arm, resource, binding, fragments, [], sink);
  const combined: FlattenedBody = {
    selectedFields: [...preamble.selectedFields, ...armBody.selectedFields],
    expansions: [...preamble.expansions, ...armBody.expansions],
  };
  rejectDuplicateBody(combined, spanOf(arm), sink);
  return {
    when: lowerExpr(arm.when),
    selectedFields: combined.selectedFields,
    expansions: combined.expansions,
    span: spanOf(arm),
  };
}

function expandBody(
  container: BodyContainer,
  resource: string,
  binding: string,
  fragments: FragmentTable,
  stack: string[],
  sink: DiagnosticSink
): FlattenedBody {
  const selectedFields: string[] = [];
  const expansions: Expansion[] = [];

  for (const item of bodyItemsInOrder(container)) {
    if (item.kind === "field") {
      selectedFields.push(item.name);
    } else if (item.kind === "expansion") {
      expansions.push(lowerExpansion(item.expansion));
    } else {
      const spreadBody = expandSpread(item.spread, resource, binding, fragments, stack, sink);
      selectedFields.push(...spreadBody.selectedFields);
      expansions.push(...spreadBody.expansions);
    }
  }

  return { selectedFields, expansions };
}

function expandSpread(
  spread: AstFragmentSpread,
  resource: string,
  binding: string,
  fragments: FragmentTable,
  stack: string[],
  sink: DiagnosticSink
): FlattenedBody {
  const name = spread.name;
  if (stack.includes(name)) {
    sink.push({
      code: "FRAGMENT_CYCLE",
      message: `Fragment cycle detected involving '${name}'`,
      span: spanOf(spread),
    });
    return EMPTY_BODY;
  }

  const frag = fragments.get(name);
  if (!frag) {
    sink.push({
      code: "UNKNOWN_FRAGMENT",
      message: `Unknown fragment '${name}'`,
      span: spanOf(spread),
    });
    return EMPTY_BODY;
  }

  if (frag.resource !== resource) {
    sink.push({
      code: "FRAGMENT_RESOURCE_MISMATCH",
      message: `Fragment '${name}' is declared on '${frag.resource}' but spread on '${resource}'`,
      span: spanOf(spread),
    });
    return EMPTY_BODY;
  }

  const body = expandBody(frag, resource, binding, fragments, [...stack, name], sink);
  return {
    selectedFields: body.selectedFields,
    expansions: body.expansions.map((e) => rebindExpansion(e, frag.binding, binding)),
  };
}

/**
 * Recover source order of fields / expands / spreads from CST.
 * Langium stores the three alternatives in separate arrays.
 */
function bodyItemsInOrder(container: BodyContainer): BodyItem[] {
  const spreadByOffset = new Map<number, AstFragmentSpread>();
  for (const spread of container.spreads) {
    const offset = spread.$cstNode?.offset;
    if (offset !== undefined) spreadByOffset.set(offset, spread);
  }
  const expansionByOffset = new Map<number, AstExpansion>();
  for (const expansion of container.expansions) {
    const offset = expansion.$cstNode?.offset;
    if (offset !== undefined) expansionByOffset.set(offset, expansion);
  }

  const fieldQueue = [...container.selectedFields];
  const ordered: { offset: number; item: BodyItem }[] = [];
  const seenOffsets = new Set<number>();

  const cst = container.$cstNode;
  const content = cst && isCompositeCstNode(cst) ? cst.content : [];

  for (const child of content) {
    const astType = child.astNode?.$type;
    if (astType === "ProjectionWhenArm") continue;

    if (spreadByOffset.has(child.offset)) {
      if (!seenOffsets.has(child.offset)) {
        seenOffsets.add(child.offset);
        ordered.push({
          offset: child.offset,
          item: { kind: "spread", spread: spreadByOffset.get(child.offset)! },
        });
      }
      continue;
    }
    if (expansionByOffset.has(child.offset)) {
      if (!seenOffsets.has(child.offset)) {
        seenOffsets.add(child.offset);
        ordered.push({
          offset: child.offset,
          item: { kind: "expansion", expansion: expansionByOffset.get(child.offset)! },
        });
      }
      continue;
    }

    const text = typeof child.text === "string" ? child.text : undefined;
    if (text !== undefined && fieldQueue[0] === text) {
      ordered.push({
        offset: child.offset,
        item: { kind: "field", name: fieldQueue.shift()! },
      });
    }
  }

  // Fallback if CST matching failed (e.g. missing CST in tests).
  for (const name of fieldQueue) {
    ordered.push({ offset: Number.MAX_SAFE_INTEGER, item: { kind: "field", name } });
  }
  for (const [offset, spread] of spreadByOffset) {
    if (!seenOffsets.has(offset)) {
      ordered.push({ offset, item: { kind: "spread", spread } });
    }
  }
  for (const [offset, expansion] of expansionByOffset) {
    if (!seenOffsets.has(offset)) {
      ordered.push({ offset, item: { kind: "expansion", expansion } });
    }
  }

  ordered.sort((a, b) => a.offset - b.offset);
  return ordered.map((e) => e.item);
}

function rejectDuplicateBody(
  body: FlattenedBody,
  span: SourceSpan | null,
  sink: DiagnosticSink
): void {
  const seenFields = new Set<string>();
  for (const field of body.selectedFields) {
    if (seenFields.has(field)) {
      sink.push({
        code: "DUPLICATE_SELECTED_FIELD",
        message: `Duplicate selected field '${field}' after fragment expansion`,
        span,
      });
    }
    seenFields.add(field);
  }
  // Expansion alias duplicates surface via checkProgram (DUPLICATE_EXPANSION_ALIAS)
  // on the flattened IR.
}

function rebindExpansion(expansion: Expansion, from: string, to: string): Expansion {
  if (from === to) return expansion;
  return {
    ...expansion,
    target: expansion.target ? rebindConstruction(expansion.target, from, to) : null,
    comprehension: expansion.comprehension
      ? {
          itemBinding: expansion.comprehension.itemBinding,
          source: rebindExpr(expansion.comprehension.source, from, to),
          arms: expansion.comprehension.arms.map((arm) => ({
            target: rebindConstruction(arm.target, from, to),
            when: arm.when ? rebindExpr(arm.when, from, to) : null,
          })),
        }
      : null,
  };
}

function rebindConstruction(
  construction: ResourceConstruction,
  from: string,
  to: string
): ResourceConstruction {
  return {
    ...construction,
    args: construction.args.map((arg) => ({
      ...arg,
      value: rebindExpr(arg.value, from, to),
    })),
  };
}

function rebindExpr(expr: Expr, from: string, to: string): Expr {
  if (from === to) return expr;
  switch (expr.kind) {
    case "literal":
    case "param":
    case "context":
      return expr;
    case "payloadRef":
    case "identityRef":
      return expr.binding === from ? { ...expr, binding: to } : expr;
    case "itemRef":
      // Item bindings are comprehension-local; do not rewrite.
      return expr;
    case "binary":
      return {
        ...expr,
        left: rebindExpr(expr.left, from, to),
        right: rebindExpr(expr.right, from, to),
      };
  }
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
