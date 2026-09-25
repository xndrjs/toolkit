/**
 * NaviQL semantic IR — parser-independent types.
 *
 * Phase 1–2 surface. Omitted for now: comprehensions, islands, `when` on
 * projections, binary/unary exprs, scalar bodies/codecs, scalar-on-scalar,
 * object-backed scalars, named enums.
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

/**
 * Semantic types. `resourceRef` is a resource *instance* contract (identity +
 * payload of that resource) — never lower to a structural object.
 * `R[]` stays `array { of: resourceRef("R") }` so collections remain distinct
 * from arrays of ordinary values.
 *
 * `typeProjection` (`Resource.field` in a type position) is preserved through
 * lowering; the checker resolves it to the payload field's semantic type.
 */
export type TypeExpr =
  | { kind: "primitive"; name: PrimitiveTypeName; span: SourceSpan | null }
  | { kind: "scalarRef"; name: string; span: SourceSpan | null }
  | { kind: "resourceRef"; name: string; span: SourceSpan | null }
  | { kind: "stringLiteral"; value: string; span: SourceSpan | null }
  | { kind: "nullable"; of: TypeExpr; span: SourceSpan | null }
  | { kind: "array"; of: TypeExpr; span: SourceSpan | null }
  | { kind: "object"; fields: FieldDecl[]; span: SourceSpan | null }
  | { kind: "union"; members: TypeExpr[]; span: SourceSpan | null }
  | {
      kind: "typeProjection";
      /** Resource whose *payload* is projected (not ARI identity). */
      resource: string;
      field: string;
      span: SourceSpan | null;
    };

export type FieldDecl = {
  name: string;
  type: TypeExpr;
  /**
   * Bare payload shorthand (`id`) inherits type from the identity field of the
   * same name. Only meaningful on object fields of a resource payload.
   */
  inheritedFromIdentity: boolean;
  span: SourceSpan | null;
};

/**
 * `resource Name(identity): payloadType`
 * - identity / ARI key before `:`
 * - resolved payload type after `:` (object, `OtherResource[]`, …)
 */
export type ResourceDefinition = {
  /**
   * Resource name = ARI type string in v1 (same by default).
   * Keep `ariType` equal to `name` in fixtures; field exists for a future override.
   */
  name: string;
  ariType: string;
  identity: { fields: FieldDecl[] };
  /** Explicit payload type after `:`. */
  payloadType: TypeExpr;
  span: SourceSpan | null;
};

/**
 * Expression nodes used in constructor args and comprehension filters.
 * `payloadRef` vs `identityRef` stay distinct through typecheck and codegen.
 * `itemRef` is only valid inside a comprehension (binding = itemBinding).
 */
export type Expr =
  | { kind: "literal"; value: string | number | boolean | null; span: SourceSpan | null }
  | { kind: "param"; name: string; span: SourceSpan | null }
  | { kind: "context"; path: string[]; span: SourceSpan | null }
  | { kind: "payloadRef"; binding: string; path: string[]; span: SourceSpan | null }
  | { kind: "identityRef"; binding: string; path: string[]; span: SourceSpan | null }
  | { kind: "itemRef"; binding: string; path: string[]; span: SourceSpan | null }
  | {
      kind: "binary";
      op: "==" | "!=";
      left: Expr;
      right: Expr;
      span: SourceSpan | null;
    };

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
 * Local expansion edge.
 * - `"one"`: single target ARI (no comprehension).
 * - `"many"`: comprehension over a source array (`for item in source if …`).
 * Multiple `"many"` expansions may share an alias (polymorphic union arms).
 * Expanding a collection resource (`TabCollection` → `Tab[]`) is still one `"one"`
 * edge to that resource; members are ordinary `Tab` instances for `on Tab`.
 */
export type Expansion = {
  alias: string;
  target: ResourceConstruction;
  multiplicity: "one" | "many";
  /**
   * Present iff `multiplicity === "many"`.
   * `filter` is `null` when the `if` clause is omitted.
   */
  comprehension: {
    itemBinding: string;
    source: Expr;
    filter: Expr | null;
  } | null;
  span: SourceSpan | null;
};

export type ResourceProjection = {
  resource: string;
  binding: string;
  selectedFields: string[];
  expansions: Expansion[];
  span: SourceSpan | null;
};

/**
 * Top-level NaviQL unit (`query Name(…) { … }`).
 * Distinct from the engine's resolution *strategy* (expansion policies).
 */
export type QueryDefinition = {
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
  queries: QueryDefinition[];
  span: SourceSpan | null;
};
