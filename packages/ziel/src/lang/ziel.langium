grammar Ziel

// MVP surface: scalars, resources (`Name(identity): payloadType`), queries,
// expansions with `each` many-arms (`when` per arm), and projection `when` arms.

entry Model:
    declarations+=Declaration*;

Declaration:
    ScalarDeclaration | OpaqueDeclaration | ResourceDeclaration
  | FragmentDeclaration | DatasourceDeclaration | QueryDeclaration;

// --- Datasources -------------------------------------------------------------
// Routing metadata only — load implementation lives in app codegen config.
// `for Resource [binding] [when expr]` mirrors island clause shape (`on` → `for`).

DatasourceDeclaration:
    'datasource' name=ID '{'
        context=ContextBlock?
        routes+=DatasourceRoute+
    '}';

DatasourceRoute:
    'for' resource=ID binding=ID? ('when' when=Expression)?;

// --- Fragments ---------------------------------------------------------------
// Compile-time reusable field/expand blocks. Spreads desugar in lower;
// binding is rewritten to the enclosing `on` / fragment binding at expand time.

FragmentDeclaration:
    'fragment' name=ID 'on' resource=ID binding=ID
        ('when' when=Expression)?
        '{'
            (selectedFields+=ID | expansions+=Expansion | spreads+=FragmentSpread | excludes+=ExcludeClause)*
        '}';

FragmentSpread:
    '...' name=ID;

/** `exclude imageId` — subtract from include/selection. Repeat the clause for more names. */
ExcludeClause:
    'exclude' names+=ID;

// --- Scalars -----------------------------------------------------------------

ScalarDeclaration:
    'scalar' name=ID 'on' representation=PrimitiveName ';';

// --- Opaques -----------------------------------------------------------------
// Nominal non-inspectable payload leaf. Representation stays outside the DSL.

OpaqueDeclaration:
    'opaque' name=ID ';';

PrimitiveName returns string:
    'string' | 'number' | 'integer' | 'boolean';

// --- Resources ---------------------------------------------------------------
// Identity (ARI key) before `:`; payload type after `:`.
// `resource TabCollection(tabsId: TabsId, locale: Locale): Tab[]`

ResourceDeclaration:
    'resource' name=ID
        '(' (identity+=TypedField (',' identity+=TypedField)*)? ')'
        ':' payloadType=TypeExpr;

TypedField:
    name=ID ':' type=TypeExpr;

/**
 * Object field: bare `id` (payload shorthand) or `title: string`.
 * `?` after the name is presence-optional (`title?: string`), distinct from
 * value-nullability (`string | null`). Combine as `title?: string | null`.
 * Optional `refers` annotates intended expand targets (types + check only).
 * Used inside object type expressions (including resource object payloads).
 */
ObjectField:
    name=ID (optional?='?')? (':' type=TypeExpr)? (refers=RefersClause)?;

/** `refers Entry` or `refers Entry with { type: "Menu" } | Entry with { type: "Footer" }` */
RefersClause:
    'refers' targets+=RefersTarget ('|' targets+=RefersTarget)*;

/** Bare `Entry` matches any payload member; `with { … }` narrows by pattern. */
RefersTarget:
    resource=ID ('with' '{'
        fields+=RefersPatternField (',' fields+=RefersPatternField)*
    '}')?;

/** Partial payload pattern: AND across fields; `|` = OR on that field's literals. */
RefersPatternField:
    name=ID ':' values+=STRING ('|' values+=STRING)*;

/**
 * Type precedence (tight → loose): atomic / `[]` / `|`.
 * Group with `(…)` for `(A | B)[]`. String literals are type atoms (`"Hero"`).
 * Bare ID is scalar, opaque, or resource — classified during lowering.
 * `null` is a type atom; unions containing it lower to IR `nullable`.
 */
TypeExpr:
    UnionMember ({infer UnionTypeExpr.members+=current} '|' members+=UnionMember)*;

UnionMember:
    AtomicTypeExpr ({infer ArrayTypeExpr.of=current} '[' ']')*;

AtomicTypeExpr:
    PrimitiveTypeExpr | TypeProjection | NamedTypeExpr | ObjectTypeExpr
  | StringLiteralTypeExpr | GroupedTypeExpr | NullTypeExpr;

PrimitiveTypeExpr:
    name=PrimitiveName;

/** Type-level `null` (value nullability). Bare `null` is rejected by check. */
NullTypeExpr:
    {infer NullTypeExpr} 'null';

/**
 * Type-level payload field projection: `EditorialModule.type` → semantic type
 * of that payload field (distributes over resource-union payloads).
 * Distinct from runtime path exprs (`p.authorId`).
 */
TypeProjection:
    resource=ID '.' field=ID;

/** Scalar, opaque, or resource name; resolved in lowering against declaration tables. */
NamedTypeExpr:
    name=ID;

/** Inline structural object; optional `;` or `,` after each field (TS-like). */
ObjectTypeExpr:
    '{' (fields+=ObjectField (';'|',')?)* '}';

StringLiteralTypeExpr:
    value=STRING;

GroupedTypeExpr:
    '(' type=TypeExpr ')';

// --- Queries -----------------------------------------------------------------

QueryDeclaration:
    'query' name=ID
        '(' (parameters+=TypedField (',' parameters+=TypedField)*)? ')'
        '{'
            context=QueryContextBlock?
            (root=RootClause | roots=RootsBlock)?
            projections+=ProjectionClause*
            islands=IslandsBlock?
        '}';

/**
 * Query execution-context projection: which params are visible to datasources.
 * Shorthand `locale` ≡ `locale: locale`. Alias form: `environment: environmentId`
 * (left = context key / DS vocabulary, right = param source).
 */
QueryContextBlock:
    'context' '{' projections+=ContextProjectionEntry* '}';

ContextProjectionEntry:
    contextName=ID (':' paramName=ID)?;

/** Datasource typed context fields (independent of query params). */
ContextBlock:
    'context' '{' fields+=TypedField* '}';

/**
 * Island policies: one clause = one startIsland.
 * `on Page` ⇒ unconditional; `on Entry e when …` ⇒ conditional (binding required).
 */
IslandsBlock:
    'islands' '{' clauses+=IslandClause+ '}';

IslandClause:
    'on' resource=ID binding=ID? ('when' when=Expression)?;

RootClause:
    'root' construction=ResourceConstruction;

RootsBlock:
    'roots' '{' entries+=RootEntry* '}';

RootEntry:
    alias=ID ':' construction=ResourceConstruction;

/**
 * Four shapes (items = fields | expands | spreads):
 *   1. Flat: items* (no when / default)
 *   2. Armed: whenArms+ defaultArm
 *   3. Preamble + armed: items+ whenArms+ defaultArm
 *   4. Resolve-only: `resolve to { ResolveArm+ }` or `resolve to each …` —
 *      no fields / expands / spreads / whenArms
 * Shapes 1–3 may optionally use `include all`, `include properties`, or
 * `include none` before `{`.
 * Items after the first `when` are a parse error (whenArms / default only follow).
 * When whenArms are present, `default { … }` is required by check (optional in grammar
 * so missing-default can be diagnosed).
 * Resolve form is mutually exclusive with projection body at parse time.
 * Brace arms and `each` are mutually exclusive in one `resolve to`.
 * IR-built programs that mix root fields with arms are still rejected by check.
 */
ProjectionClause:
    'on' resource=ID binding=ID (
        'resolve' 'to' (
            '{' resolveArms+=ResolveArm+ '}'
          | resolveEach=EachComprehension
        )
      | (include=IncludeMode)? '{'
            (selectedFields+=ID | expansions+=Expansion | spreads+=FragmentSpread | excludes+=ExcludeClause)*
            whenArms+=ProjectionWhenArm*
            defaultArm=ProjectionDefaultArm?
        '}'
    );

/**
 * `include all` | `include properties` | `include none` — Langium may store as
 * `"includeall"` / `"includeproperties"` / `"includenone"`.
 */
IncludeMode returns string:
    'include' 'all' | 'include' 'properties' | 'include' 'none';

/** Conditional arm: `when expr include properties { … }` — applied in source order. */
ProjectionWhenArm:
    'when' when=Expression (include=IncludeMode)? '{'
        (selectedFields+=ID | expansions+=Expansion | spreads+=FragmentSpread | excludes+=ExcludeClause)*
    '}';

/** Catch-all arm when one or more `when` arms are present: `default { … }`. */
ProjectionDefaultArm:
    'default' (include=IncludeMode)? '{'
        (selectedFields+=ID | expansions+=Expansion | spreads+=FragmentSpread | excludes+=ExcludeClause)*
    '}';

/** Redirect arm: `Entry(…) when c.type == "Entry"`. */
ResolveArm:
    target=ResourceConstruction ('when' when=Expression)?;

/**
 * Per-edge load failure policy after `expand` target / `each` arm.
 * Default when omitted: `throw`. `set null` / `set error` widen projected aliases.
 */
OnFailureClause:
    'on' 'failure' (
        {infer OnFailureThrow} 'throw'
      | {infer OnFailureSetNull} 'set' 'null'
      | {infer OnFailureSetError} 'set' 'error'
    );

Expansion:
    'expand' alias=ID ':' (
        each=EachComprehension
      | target=ResourceConstruction onFailure=OnFailureClause?
    );

/** `each item in source ( Constr when …, … )` — polymorphic many-expand. */
EachComprehension:
    'each' itemBinding=ID 'in' source=Expression
        '(' arms+=ExpandArm (',' arms+=ExpandArm)* ')';

ExpandArm:
    target=ResourceConstruction ('when' when=Expression)? onFailure=OnFailureClause?;

ResourceConstruction:
    resource=ID '(' (args+=NamedArg (',' args+=NamedArg)*)? ')';

NamedArg:
    name=ID ':' value=Expression;

// --- Expressions -------------------------------------------------------------
// Path shapes are classified during lowering (param / payloadRef / itemRef).
// `context.path` and `@binding[.path]` are dedicated forms (context is a keyword).
// When filters: `or` / `and` / `==`/`!=` / `in`/`not in` / unary `!` (JS falsy).
// Scalar → representation cast: `expr as string` (postfix, binds tighter than `==`).
// Precedence: `as` > `!` > `==`/`!=` > `in`/`not in` > `and` > `or`. Parentheses group.

Expression:
    OrExpr;

OrExpr:
    AndExpr ({infer BinaryExpr.left=current} op='or' right=AndExpr)*;

AndExpr:
    InExpr ({infer BinaryExpr.left=current} op='and' right=InExpr)*;

InExpr:
    EqExpr ({infer BinaryExpr.left=current} op=MembershipOp right=ArrayLiteral)?;

MembershipOp returns string:
    'in' | 'not' 'in';

EqExpr:
    UnaryExpr ({infer BinaryExpr.left=current} op=('==' | '!=') right=UnaryExpr)?;

UnaryExpr:
    {infer UnaryExpr} op='!' operand=UnaryExpr
  | CastExpr;

/** `locale as string` — erase a scalar (or matching primitive) to its representation. */
CastExpr:
    Primary ({infer CastExpr.operand=current} 'as' type=PrimitiveName)*;

Primary:
    GroupedExpr | ArrayLiteral | Literal | IdentityRef | ContextRef | PathRef;

GroupedExpr:
    '(' expr=Expression ')';

/** Value list for membership (`e.type in ["Menu", "Footer"]`). Literals only. */
ArrayLiteral:
    '[' (elements+=Literal (',' elements+=Literal)*)? ']';

Literal:
    StringLiteral | NumberLiteral | BooleanLiteral | NullLiteral;

StringLiteral:
    value=STRING;

NumberLiteral:
    value=NUMBER;

BooleanLiteral:
    value=('true' | 'false');

NullLiteral:
    {infer NullLiteral} 'null';

IdentityRef:
    '@' binding=ID ('.' path+=ID)*;

ContextRef:
    'context' '.' path+=ID ('.' path+=ID)*;

PathRef:
    segments+=ID ('.' segments+=ID)*;

// --- Terminals ---------------------------------------------------------------

hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z][\w_]*/;
terminal STRING: /"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/;
terminal NUMBER: /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
