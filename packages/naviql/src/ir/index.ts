/**
 * NaviQL semantic IR — parser-independent types.
 *
 * Phase 1 surface (checker needs only). Omitted for now: comprehensions,
 * islands, unions, `when` on projections, binary/unary exprs, resourceRef,
 * scalar bodies/codecs, scalar-on-scalar, object-backed scalars.
 *
 * Presence/absence that affects meaning or diagnostics is never optional:
 * use `null` (or required `boolean`) so producers must choose explicitly.
 */

/** Source location for diagnostics. Checker may ignore spans initially. */
export type SourceSpan = {
  start: number;
  end: number;
  /** File / buffer URI; `null` when the program is in-memory only. */
  uri: string | null;
};

export type PrimitiveTypeName = "string" | "number" | "boolean";

/**
 * Nominal custom scalar: semantic name backed by a primitive representation.
 * Do not lower `scalarRef` to `primitive` in IR or during semantic analysis —
 * representation is consulted only for literal inhabitance and (later) codegen.
 */
export type ScalarDefinition = {
  name: string;
  representation: PrimitiveTypeName;
  /** Reserved for future codecs / validation metadata; `null` when unused. */
  metadata: Record<string, unknown> | null;
  span: SourceSpan | null;
};

export type TypeExpr =
  | { kind: "primitive"; name: PrimitiveTypeName; span: SourceSpan | null }
  | { kind: "scalarRef"; name: string; span: SourceSpan | null }
  | { kind: "nullable"; of: TypeExpr; span: SourceSpan | null }
  | { kind: "array"; of: TypeExpr; span: SourceSpan | null }
  | { kind: "object"; fields: FieldDecl[]; span: SourceSpan | null };

export type FieldDecl = {
  name: string;
  type: TypeExpr;
  /** Bare payload shorthand (`id`) inherits type from the identity field of the same name. */
  inheritedFromIdentity: boolean;
  span: SourceSpan | null;
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
  span: SourceSpan | null;
};

/**
 * Expression nodes used in constructor args and (later) filters.
 * `payloadRef` vs `identityRef` stay distinct through typecheck and codegen.
 */
export type Expr =
  | { kind: "literal"; value: string | number | boolean | null; span: SourceSpan | null }
  | { kind: "param"; name: string; span: SourceSpan | null }
  | { kind: "context"; path: string[]; span: SourceSpan | null }
  | { kind: "payloadRef"; binding: string; path: string[]; span: SourceSpan | null }
  | { kind: "identityRef"; binding: string; path: string[]; span: SourceSpan | null };

export type NamedArg = {
  name: string;
  value: Expr;
  span: SourceSpan | null;
};

/** ARI construction: `User(id: p.authorId)`. */
export type ResourceConstruction = {
  resource: string;
  args: NamedArg[];
  span: SourceSpan | null;
};

/**
 * Local expansion edge. Phase 1: multiplicity is always `"one"` (no comprehensions).
 */
export type Expansion = {
  alias: string;
  target: ResourceConstruction;
  multiplicity: "one";
  span: SourceSpan | null;
};

export type ResourceProjection = {
  resource: string;
  binding: string;
  selectedFields: string[];
  expansions: Expansion[];
  span: SourceSpan | null;
};

export type StrategyDefinition = {
  name: string;
  parameters: FieldDecl[];
  context: FieldDecl[];
  root: ResourceConstruction;
  projections: ResourceProjection[];
  span: SourceSpan | null;
};

export type Program = {
  scalars: ScalarDefinition[];
  resources: ResourceDefinition[];
  strategies: StrategyDefinition[];
  span: SourceSpan | null;
};
