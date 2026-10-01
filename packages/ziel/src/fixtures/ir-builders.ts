import type {
  DatasourceDefinition,
  DatasourceResourceRoute,
  Expr,
  Expansion,
  FieldDecl,
  NamedArg,
  PrimitiveTypeName,
  QueryDefinition,
  QueryRoot,
  RefersTarget,
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

export function objectType(...fields: FieldDecl[]): Extract<TypeExpr, { kind: "object" }> {
  return { kind: "object", fields, span };
}

export function union(...members: TypeExpr[]): TypeExpr {
  return { kind: "union", members, span };
}

export function field(
  name: string,
  type: TypeExpr,
  inheritedFromIdentity = false,
  refers: RefersTarget[] | null = null,
  optional = false
): FieldDecl {
  return { name, type, optional, inheritedFromIdentity, refers, span };
}

export function nullable(of: TypeExpr): TypeExpr {
  return { kind: "nullable", of, span };
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

/** Single-root IR entry (`alias: null`) or a named multi-root entry. */
export function queryRoot(
  construction: ResourceConstruction,
  alias: string | null = null
): QueryRoot {
  return { alias, construction, span };
}

/** Wrap a construction as the sole single-root seed (`alias: null`). */
export function singleRoot(construction: ResourceConstruction): QueryRoot[] {
  return [queryRoot(construction)];
}

export function expand(
  alias: string,
  target: ResourceConstruction,
  comprehension: Expansion["comprehension"] = null,
  onFailure: Expansion["onFailure"] = "throw"
): Expansion {
  if (comprehension) {
    return {
      alias,
      target: null,
      multiplicity: "many",
      comprehension,
      onFailure: "throw",
      span,
    };
  }
  return {
    alias,
    target,
    multiplicity: "one",
    comprehension: null,
    onFailure,
    span,
  };
}

/** Many-expand helper: `each item in source ( arms )`. */
export function expandEach(
  alias: string,
  itemBinding: string,
  source: Expr,
  arms: {
    target: ResourceConstruction;
    when?: Expr | null;
    onFailure?: Expansion["onFailure"];
  }[]
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
        onFailure: arm.onFailure ?? "throw",
      })),
    },
    onFailure: "throw",
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
  expansions: Expansion[] = [],
  arms: ResourceProjection["arms"] = null,
  include: ResourceProjection["include"] = null,
  excludedFields: string[] = [],
  defaultArm: ResourceProjection["defaultArm"] = null
): ResourceProjection {
  return {
    resource: resourceName,
    binding,
    selectedFields,
    expansions,
    excludedFields,
    include,
    arms,
    defaultArm,
    resolveArms: null,
    resolveEach: null,
    span,
  };
}

/** Armed projection helper: `on Entry e { when … { … } … default { … } }`. */
export function projectionWithArms(
  resourceName: string,
  binding: string,
  arms: NonNullable<ResourceProjection["arms"]>,
  include: ResourceProjection["include"] = null,
  excludedFields: string[] = [],
  defaultArm: ResourceProjection["defaultArm"] = {
    selectedFields: [],
    expansions: [],
    excludedFields: [],
    include: null,
    span,
  }
): ResourceProjection {
  return {
    resource: resourceName,
    binding,
    selectedFields: [],
    expansions: [],
    excludedFields,
    include,
    arms,
    defaultArm,
    resolveArms: null,
    resolveEach: null,
    span,
  };
}

/** Resolve-only projection helper: `on CustomReference c resolve to { … }`. */
export function projectionWithResolve(
  resourceName: string,
  binding: string,
  resolveArms: NonNullable<ResourceProjection["resolveArms"]>
): ResourceProjection {
  return {
    resource: resourceName,
    binding,
    selectedFields: [],
    expansions: [],
    excludedFields: [],
    include: null,
    arms: null,
    defaultArm: null,
    resolveArms,
    resolveEach: null,
    span,
  };
}

/** Many-resolve projection helper: `on TabCollection tc resolve to each …`. */
export function projectionWithResolveEach(
  resourceName: string,
  binding: string,
  resolveEach: NonNullable<ResourceProjection["resolveEach"]>
): ResourceProjection {
  return {
    resource: resourceName,
    binding,
    selectedFields: [],
    expansions: [],
    excludedFields: [],
    include: null,
    arms: null,
    defaultArm: null,
    resolveArms: null,
    resolveEach,
    span,
  };
}

export function projectionArm(
  when: Expr,
  selectedFields: string[],
  expansions: Expansion[] = [],
  include: NonNullable<ResourceProjection["arms"]>[number]["include"] = null,
  excludedFields: string[] = []
): NonNullable<ResourceProjection["arms"]>[number] {
  return {
    when,
    selectedFields,
    expansions,
    excludedFields,
    include,
    span,
  };
}

export function projectionDefaultArm(
  selectedFields: string[] = [],
  expansions: Expansion[] = [],
  include: NonNullable<ResourceProjection["defaultArm"]>["include"] = null,
  excludedFields: string[] = []
): NonNullable<ResourceProjection["defaultArm"]> {
  return {
    selectedFields,
    expansions,
    excludedFields,
    include,
    span,
  };
}

export function resolveArm(
  target: ResourceConstruction,
  when: Expr | null = null
): NonNullable<ResourceProjection["resolveArms"]>[number] {
  return {
    target,
    when,
    span,
  };
}

export function query(
  name: string,
  partial: Omit<
    QueryDefinition,
    "name" | "span" | "islands" | "contextDeclared" | "contextProjections"
  > &
    Partial<Pick<QueryDefinition, "islands" | "contextDeclared" | "contextProjections">>
): QueryDefinition {
  return {
    name,
    span,
    islands: [],
    contextDeclared: true,
    contextProjections: [],
    ...partial,
  };
}

/** One `for Resource [binding] [when …]` route. */
export function datasourceRoute(
  resourceName: string,
  alias: string | null = null,
  when: Expr | null = null
): DatasourceResourceRoute {
  return { resource: resourceName, alias, when, span };
}

/** Top-level `datasource Name { … }` IR helper. */
export function datasource(
  name: string,
  routes: DatasourceResourceRoute[],
  contextFields: FieldDecl[] = []
): DatasourceDefinition {
  return { name, contextFields, routes, span };
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

export function arrayLit(...elements: (string | number | boolean | null)[]): Expr {
  return {
    kind: "arrayLiteral",
    elements: elements.map((value) => lit(value)),
    span,
  };
}

export function inList(left: Expr, ...elements: (string | number | boolean | null)[]): Expr {
  return { kind: "binary", op: "in", left, right: arrayLit(...elements), span };
}

export function notInList(left: Expr, ...elements: (string | number | boolean | null)[]): Expr {
  return { kind: "binary", op: "not in", left, right: arrayLit(...elements), span };
}

export function not(operand: Expr): Expr {
  return { kind: "unary", op: "!", operand, span };
}

export function cast(operand: Expr, type: "string" | "number" | "boolean"): Expr {
  return { kind: "cast", operand, type, span };
}

export function and(left: Expr, right: Expr): Expr {
  return { kind: "binary", op: "and", left, right, span };
}

export function or(left: Expr, right: Expr): Expr {
  return { kind: "binary", op: "or", left, right, span };
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
