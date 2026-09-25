/**
 * NaviQL semantic IR — parser-independent types.
 *
 * Phase 1 surface (checker needs only). Omitted for now: comprehensions,
 * islands, unions, `when` on projections, binary/unary exprs, resourceRef.
 */

/** Optional source location for future diagnostics (checker may ignore). */
export type SourceSpan = {
  start: number;
  end: number;
  /** Optional file / buffer URI once a parser exists. */
  uri?: string;
};

export type PrimitiveTypeName = "string" | "number" | "boolean";

export type TypeExpr =
  | { kind: "primitive"; name: PrimitiveTypeName; span?: SourceSpan }
  | { kind: "nullable"; of: TypeExpr; span?: SourceSpan }
  | { kind: "array"; of: TypeExpr; span?: SourceSpan }
  | { kind: "object"; fields: FieldDecl[]; span?: SourceSpan };

export type FieldDecl = {
  name: string;
  type: TypeExpr;
  /** Bare payload shorthand (`id`) inherits type from the identity field of the same name. */
  inheritedFromIdentity?: boolean;
  span?: SourceSpan;
};

export type ResourceDefinition = {
  /**
   * Resource name = ARI type string in v1 (same by default).
   * Keep `ariType` equal to `name` in fixtures; field exists for a future override.
   */
  name: string;
  ariType: string;
  identity: { fields: FieldDecl[] };
  payload: { fields: FieldDecl[] };
  span?: SourceSpan;
};

/**
 * Expression nodes used in constructor args and (later) filters.
 * `payloadRef` vs `identityRef` stay distinct through typecheck and codegen.
 */
export type Expr =
  | { kind: "literal"; value: string | number | boolean | null; span?: SourceSpan }
  | { kind: "param"; name: string; span?: SourceSpan }
  | { kind: "context"; path: string[]; span?: SourceSpan }
  | { kind: "payloadRef"; binding: string; path: string[]; span?: SourceSpan }
  | { kind: "identityRef"; binding: string; path: string[]; span?: SourceSpan };

export type NamedArg = {
  name: string;
  value: Expr;
  span?: SourceSpan;
};

/** ARI construction: `User(id: p.authorId)`. */
export type ResourceConstruction = {
  resource: string;
  args: NamedArg[];
  span?: SourceSpan;
};

/**
 * Local expansion edge. Phase 1: multiplicity is always `"one"` (no comprehensions).
 */
export type Expansion = {
  alias: string;
  target: ResourceConstruction;
  multiplicity: "one";
  span?: SourceSpan;
};

export type ResourceProjection = {
  resource: string;
  binding: string;
  selectedFields: string[];
  expansions: Expansion[];
  span?: SourceSpan;
};

export type StrategyDefinition = {
  name: string;
  parameters: FieldDecl[];
  context: FieldDecl[];
  root: ResourceConstruction;
  projections: ResourceProjection[];
  span?: SourceSpan;
};

export type Program = {
  resources: ResourceDefinition[];
  strategies: StrategyDefinition[];
  span?: SourceSpan;
};
