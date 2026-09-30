/**
 * Ziel semantic IR — parser-independent types.
 *
 * Phase 1–5+ surface. Omitted for now: scalar bodies/codecs,
 * scalar-on-scalar, object-backed scalars, named enums.
 *
 * Presence/absence that affects meaning or diagnostics is never optional:
 * use `null` (or required `boolean`) so producers must choose explicitly.
 */

/** Source location for diagnostics (attached by the checker / parse pipeline). */
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
 * representation is consulted for literal inhabitance, `expr as Primitive` casts,
 * and codegen.
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
 * `R[]` lowers to `array { of: resourceRef("R") }` as **payload typing only**
 * (an array of R’s payload shape) — not a traversal / fan-out construct.
 *
 * `typeProjection` (`Resource.field` in a type position) is preserved through
 * lowering; the checker resolves it to the payload field's semantic type.
 */
export type TypeExpr =
  | { kind: "primitive"; name: PrimitiveTypeName; span: SourceSpan | null }
  | { kind: "scalarRef"; name: string; span: SourceSpan | null }
  | { kind: "resourceRef"; name: string; span: SourceSpan | null }
  | { kind: "stringLiteral"; value: string; span: SourceSpan | null }
  /** Bare `null` type atom; valid only as a union member before lower normalizes to `nullable`. Surviving nodes are rejected by check (`INVALID_NULL_TYPE`). */
  | { kind: "null"; span: SourceSpan | null }
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

/**
 * One field in a `refers … with { … }` pattern.
 * Values are OR'd; fields within a target are AND'd.
 */
export type RefersPatternField = {
  name: string;
  values: string[];
  span: SourceSpan | null;
};

/** One `Resource with { field: "lit" | … }` target in a `refers` clause. */
export type RefersTarget = {
  resource: string;
  fields: RefersPatternField[];
  span: SourceSpan | null;
};

export type FieldDecl = {
  name: string;
  type: TypeExpr;
  /**
   * Presence-optional field (`name?: T` in the DSL). Distinct from value
   * nullability (`T | null` → `nullable`). Default `false`.
   */
  optional: boolean;
  /**
   * Bare payload shorthand (`id`) inherits type from the identity field of the
   * same name. Only meaningful on object fields of a resource payload.
   */
  inheritedFromIdentity: boolean;
  /**
   * Intended expand targets for this field (`refers …`). `null` when absent.
   * Domain metadata for types/check only — not required to be an id scalar.
   */
  refers: RefersTarget[] | null;
  span: SourceSpan | null;
};

/**
 * `resource Name(identity): PayloadType` — RHS is always a **payload type**.
 * A resource name there (`TabsCollection(…): Tab[]`) means an array of Tab’s
 * payload shape, not “fan out to Tab ARIs”. Identity / ARI key is before `:`.
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
 * Expression nodes used in constructor args and `when` filters (`each` arms and
 * projection arms). `payloadRef` vs `identityRef` stay distinct through typecheck
 * and codegen. `itemRef` is only valid inside an `each` comprehension
 * (binding = itemBinding).
 */
export type Expr =
  | { kind: "literal"; value: string | number | boolean | null; span: SourceSpan | null }
  | { kind: "param"; name: string; span: SourceSpan | null }
  | { kind: "context"; path: string[]; span: SourceSpan | null }
  | { kind: "payloadRef"; binding: string; path: string[]; span: SourceSpan | null }
  | { kind: "identityRef"; binding: string; path: string[]; span: SourceSpan | null }
  | { kind: "itemRef"; binding: string; path: string[]; span: SourceSpan | null }
  | {
      kind: "arrayLiteral";
      elements: Expr[];
      span: SourceSpan | null;
    }
  | {
      kind: "unary";
      op: "!";
      operand: Expr;
      span: SourceSpan | null;
    }
  | {
      /** Erase a scalar (or matching primitive / string literal) to a primitive. */
      kind: "cast";
      operand: Expr;
      type: PrimitiveTypeName;
      span: SourceSpan | null;
    }
  | {
      kind: "binary";
      op: "==" | "!=" | "in" | "not in" | "and" | "or";
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
 * Per-edge load failure policy (`on failure …` in the DSL).
 * Default when the clause is omitted: `"throw"`.
 */
export type OnFailurePolicy = "throw" | "setNull" | "setError";

/** One arm of an `each` many-expand: construction + optional `when` + `on failure`. */
export type ExpandArm = {
  target: ResourceConstruction;
  when: Expr | null;
  /** Defaults to `"throw"` when the DSL omits `on failure`. */
  onFailure: OnFailurePolicy;
};

/**
 * Local expansion edge.
 * - `"one"`: single target ARI (`target` set; `comprehension` null).
 * - `"many"`: `each item in source ( arms )` — polymorphic constructions.
 * Loading a collection resource returns its payload (e.g. `Tab[]`) as-is;
 * member ARIs are not inferred — hop only via explicit `expand` / `each` /
 * `on` / `resolve to` / `resolve to each`.
 */
export type Expansion = {
  alias: string;
  /** Non-null iff `multiplicity === "one"`. */
  target: ResourceConstruction | null;
  multiplicity: "one" | "many";
  /**
   * Present iff `multiplicity === "many"`.
   * `when` is `null` when the arm has no filter.
   */
  comprehension: {
    itemBinding: string;
    source: Expr;
    arms: ExpandArm[];
  } | null;
  /**
   * One-expand failure policy (`on failure` after the target).
   * Ignored for `"many"` (policy lives on each {@link ExpandArm}).
   * Defaults to `"throw"` when omitted in the DSL.
   */
  onFailure: OnFailurePolicy;
  span: SourceSpan | null;
};

/** Body of a projection arm or `default` (fields / expands / include / exclude). */
export type ProjectionArmBody = {
  selectedFields: string[];
  expansions: Expansion[];
  /**
   * Field names from `exclude …` in this arm body (plus any preamble excludes
   * merged at lower). Empty when none.
   */
  excludedFields: string[];
  /**
   * `include all` | `include properties` | `include none` on this arm,
   * or `null` when absent. Effective include is
   * `arm.include ?? projection.include` (`include none` overrides a parent).
   */
  include: "all" | "properties" | "none" | null;
  span: SourceSpan | null;
};

/** One arm of a projection `when` block: filter + selected fields / expansions. */
export type ProjectionArm = ProjectionArmBody & {
  when: Expr;
};

/**
 * One arm of `on R b resolve to { … }`: construction + optional `when` filter.
 * Same construction shape as expand targets; settles via redirect, not projection.
 */
export type ResolveArm = {
  target: ResourceConstruction;
  when: Expr | null;
  span: SourceSpan | null;
};

/**
 * Many-resolve: `on R b resolve to each item in source ( arms )`.
 * Expansion-backed 1→N strip — same arm shape as expand `each`, not RGR redirects.
 */
export type ResolveEach = {
  itemBinding: string;
  source: Expr;
  arms: ExpandArm[];
};

export type ResourceProjection = {
  resource: string;
  binding: string;
  /**
   * Flat body fields. Empty when `arms !== null`, `resolveArms !== null`, or
   * `resolveEach !== null` (armed / resolve-only projections keep fields off
   * the root body).
   */
  selectedFields: string[];
  /**
   * Flat body expansions. Empty when `arms !== null`, `resolveArms !== null`,
   * or `resolveEach !== null`.
   */
  expansions: Expansion[];
  /**
   * Field names from `exclude …` in the flat body. Empty when none, armed, or
   * resolve-only (armed arms carry their own `excludedFields`, including any
   * preamble excludes merged at lower).
   */
  excludedFields: string[];
  /**
   * `include all` | `include properties` | `include none` on the projection
   * clause, or `null` when absent / resolve-only. Per-arm effective include is
   * `arm.include ?? projection.include` (`include none` overrides a parent).
   * Effective selection =
   * `(selectedFields ∪ includeSet) − excludedFields − expansionAliases`
   * against the relevant payload (full resource for flat; narrowed for
   * when-arms) — see `resolveSelectedFields`.
   */
  include: "all" | "properties" | "none" | null;
  /**
   * Ordered `when` arms, or `null` for an unconditional flat `on` body.
   * Mixing flat fields/expansions with arms is rejected by the checker.
   * When non-null and non-empty, `defaultArm` is required by check.
   * Mutually exclusive with `resolveArms` / `resolveEach`.
   */
  arms: ProjectionArm[] | null;
  /**
   * Catch-all body when `arms` is non-empty. `null` for flat / resolve-only
   * projections, or when lowering omitted a missing `default` (checker error).
   */
  defaultArm: ProjectionArmBody | null;
  /**
   * 1→1 resolve-only redirect arms (`on R b resolve to { … }`), or `null`.
   * Mutually exclusive with projection body and with {@link resolveEach}.
   */
  resolveArms: ResolveArm[] | null;
  /**
   * 1→N resolve-to-each (`on R b resolve to each …`), or `null`.
   * Mutually exclusive with projection body and with {@link resolveArms}.
   */
  resolveEach: ResolveEach | null;
  span: SourceSpan | null;
};

/**
 * One seed of a query: singular `root R(…)` lowers to `alias: null`;
 * each `roots { alias: R(…) }` entry keeps its alias.
 */
export type QueryRoot = {
  /** `null` for single-root syntax; non-null for multi-root entries. */
  alias: string | null;
  construction: ResourceConstruction;
  span: SourceSpan | null;
};

/**
 * One `on Resource [binding] [when expr]` clause inside a query `islands` block.
 * `when: null` ⇒ unconditional `startIsland`.
 */
export type IslandClause = {
  resource: string;
  binding: string | null;
  when: Expr | null;
  span: SourceSpan | null;
};

/**
 * Top-level Ziel unit (`query Name(…) { … }`).
 * Distinct from the engine's resolution *strategy* (expansion policies).
 */
export type QueryDefinition = {
  name: string;
  parameters: FieldDecl[];
  context: FieldDecl[];
  /**
   * True when the source wrote a `context { … }` block (possibly empty).
   * False when the block was omitted — check emits `MISSING_CONTEXT`.
   * Hand-built IR should set this `true` unless testing that diagnostic.
   */
  contextDeclared: boolean;
  /** Non-empty after a successful parse with a root; empty when omitted or hand-built. */
  roots: QueryRoot[];
  projections: ResourceProjection[];
  /** Island start policies from an `islands { … }` block; empty when absent. */
  islands: IslandClause[];
  span: SourceSpan | null;
};

/** True when the query used singular `root` syntax (one entry, `alias: null`). */
export function isSingleRootQuery(query: QueryDefinition): boolean {
  return query.roots.length === 1 && query.roots[0]!.alias === null;
}

/**
 * Compile-time reusable projection body
 * (`fragment Name on Resource b [when …] { … }`).
 * Spreads desugar into enclosing `on` clauses; the declaration itself is kept
 * in IR so unused / mis-bound fragment bodies are still typechecked.
 *
 * Fragments carry explicit fields / expands / excludes only — `include` lives
 * on projection clauses and when-arms (the projection site owns include policy).
 * `when` narrows the fragment payload for field checks (same as projection arms).
 */
export type FragmentDefinition = {
  name: string;
  resource: string;
  binding: string;
  /** Optional filter; `null` when omitted. Narrows the fragment payload. */
  when: Expr | null;
  selectedFields: string[];
  /** Field names from `exclude …`; empty when none. */
  excludedFields: string[];
  expansions: Expansion[];
  span: SourceSpan | null;
};

/**
 * One `for Resource [binding] [when expr]` route inside a `datasource` block.
 * `alias` is `null` when the binding is omitted; `when` is `null` when absent.
 */
export type DatasourceResourceRoute = {
  resource: string;
  /** Binding alias for `when` / identity refs; `null` when `for Entry` with no binding. */
  alias: string | null;
  when: Expr | null;
  span: SourceSpan | null;
};

/**
 * Top-level `datasource Name { … }` — routing metadata only (no loader body).
 * App codegen supplies `load` / `batchSize` / `concurrency`.
 */
export type DatasourceDefinition = {
  name: string;
  contextFields: FieldDecl[];
  routes: DatasourceResourceRoute[];
  span: SourceSpan | null;
};

export type Program = {
  scalars: ScalarDefinition[];
  resources: ResourceDefinition[];
  /** Top-level `fragment` declarations (after spread expansion within each body). */
  fragments: FragmentDefinition[];
  /** Top-level `datasource` declarations (routing metadata; empty when none declared). */
  datasources: DatasourceDefinition[];
  queries: QueryDefinition[];
  span: SourceSpan | null;
};
