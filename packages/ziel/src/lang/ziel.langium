grammar Ziel

// MVP surface: scalars, resources (`Name(identity): payloadType`), queries,
// expansions with `each` many-arms (`when` per arm), and projection `when` arms.

entry Model:
    declarations+=Declaration*;

Declaration:
    ScalarDeclaration | ResourceDeclaration | FragmentDeclaration
  | DatasourceDeclaration | QueryDeclaration;

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
        (include=IncludeMode)?
        '{'
            (selectedFields+=ID | expansions+=Expansion | spreads+=FragmentSpread | excludes+=ExcludeClause)*
        '}';

FragmentSpread:
    '...' name=ID;

/** `exclude imageId` or `exclude imageId title` — subtract from include/selection. */
ExcludeClause:
    'exclude' names+=ID+;

// --- Scalars -----------------------------------------------------------------

ScalarDeclaration:
    'scalar' name=ID 'on' representation=PrimitiveName ';';

PrimitiveName returns string:
    'string' | 'number' | 'boolean';

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
 * Optional `refers` annotates intended expand targets (types + check only).
 * Used inside object type expressions (including resource object payloads).
 */
ObjectField:
    name=ID (':' type=TypeExpr)? (refers=RefersClause)?;

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
 * Bare ID is scalar or resource — classified during lowering.
 */
TypeExpr:
    UnionMember ({infer UnionTypeExpr.members+=current} '|' members+=UnionMember)*;

UnionMember:
    AtomicTypeExpr ({infer ArrayTypeExpr.of=current} '[' ']')*;

AtomicTypeExpr:
    PrimitiveTypeExpr | TypeProjection | NamedTypeExpr | ObjectTypeExpr | StringLiteralTypeExpr | GroupedTypeExpr;

PrimitiveTypeExpr:
    name=PrimitiveName;

/**
 * Type-level payload field projection: `EditorialModule.type` → semantic type
 * of that payload field (distributes over resource-union payloads).
 * Distinct from runtime path exprs (`p.authorId`).
 */
TypeProjection:
    resource=ID '.' field=ID;

/** Scalar or resource name; resolved in lowering against declaration tables. */
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
            context=ContextBlock?
            (root=RootClause | roots=RootsBlock)?
            projections+=ProjectionClause*
            islands=IslandsBlock?
        '}';

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
 *   1. Flat: items* (no when)
 *   2. Armed: whenArms+ only
 *   3. Preamble + armed: items+ whenArms+
 *   4. Resolve-only: `resolve to { ResolveArm+ }` — no fields / expands / spreads / whenArms
 * Shapes 1–3 may optionally use `include all`, `include properties`, or
 * `include none` before `{`.
 * Items after the first `when` are a parse error (whenArms only follow).
 * Resolve form is mutually exclusive with projection body at parse time.
 * IR-built programs that mix root fields with arms are still rejected by check.
 */
ProjectionClause:
    'on' resource=ID binding=ID (
        'resolve' 'to' '{'
            resolveArms+=ResolveArm+
        '}'
      | (include=IncludeMode)? '{'
            (selectedFields+=ID | expansions+=Expansion | spreads+=FragmentSpread | excludes+=ExcludeClause)*
            whenArms+=ProjectionWhenArm*
        '}'
    );

/**
 * `include all` | `include properties` | `include none` — Langium may store as
 * `"includeall"` / `"includeproperties"` / `"includenone"`.
 */
IncludeMode returns string:
    'include' 'all' | 'include' 'properties' | 'include' 'none';

/** Discriminant arm: `when e.type == "Hero" include properties { … }`. */
ProjectionWhenArm:
    'when' when=Expression (include=IncludeMode)? '{'
        (selectedFields+=ID | expansions+=Expansion | spreads+=FragmentSpread | excludes+=ExcludeClause)*
    '}';

/** Redirect arm: `Entry(…) when c.type == "Entry"`. */
ResolveArm:
    target=ResourceConstruction ('when' when=Expression)?;

Expansion:
    'expand' alias=ID ':' (
        each=EachComprehension
      | target=ResourceConstruction
    );

/** `each item in source ( Constr when …, … )` — polymorphic many-expand. */
EachComprehension:
    'each' itemBinding=ID 'in' source=Expression
        '(' arms+=ExpandArm (',' arms+=ExpandArm)* ')';

ExpandArm:
    target=ResourceConstruction ('when' when=Expression)?;

ResourceConstruction:
    resource=ID '(' (args+=NamedArg (',' args+=NamedArg)*)? ')';

NamedArg:
    name=ID ':' value=Expression;

// --- Expressions -------------------------------------------------------------
// Path shapes are classified during lowering (param / payloadRef / itemRef).
// `context.path` and `@binding[.path]` are dedicated forms (context is a keyword).
// When filters: `or` / `and` / `==`/`!=` / `in`/`not in` / unary `!` (JS falsy).
// Precedence: `!` > `==`/`!=` > `in`/`not in` > `and` > `or`. Parentheses group.

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
  | Primary;

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
