grammar NaviQl

// MVP surface: scalars, resources (`Name(identity): payloadType`), queries,
// expansions with `each` many-arms (`when` per arm), and projection `when` arms.

entry Model:
    declarations+=Declaration*;

Declaration:
    ScalarDeclaration | ResourceDeclaration | FragmentDeclaration | QueryDeclaration;

// --- Fragments ---------------------------------------------------------------
// Compile-time reusable field/expand blocks. Spreads desugar in lower;
// binding is rewritten to the enclosing `on` / fragment binding at expand time.

FragmentDeclaration:
    'fragment' name=ID 'on' resource=ID binding=ID '{'
        (selectedFields+=ID | expansions+=Expansion | spreads+=FragmentSpread)*
    '}';

FragmentSpread:
    '...' name=ID;

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
 * Used inside object type expressions (including resource object payloads).
 */
ObjectField:
    name=ID (':' type=TypeExpr)?;

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
            (root=RootClause | roots=RootsBlock)
            projections+=ProjectionClause*
        '}';

ContextBlock:
    'context' '{' fields+=TypedField* '}';

RootClause:
    'root' construction=ResourceConstruction;

RootsBlock:
    'roots' '{' entries+=RootEntry+ '}';

RootEntry:
    alias=ID ':' construction=ResourceConstruction;

/**
 * Four shapes (items = fields | expands | spreads):
 *   1. Flat: items* (no when)
 *   2. Armed: whenArms+ only
 *   3. Preamble + armed: items+ whenArms+
 *   4. Resolve-only: `resolve to { ResolveArm+ }` — no fields / expands / spreads / whenArms
 * Items after the first `when` are a parse error (whenArms only follow).
 * Resolve form is mutually exclusive with projection body at parse time.
 * IR-built programs that mix root fields with arms are still rejected by check.
 */
ProjectionClause:
    'on' resource=ID binding=ID (
        'resolve' 'to' '{'
            resolveArms+=ResolveArm+
        '}'
      | '{'
            (selectedFields+=ID | expansions+=Expansion | spreads+=FragmentSpread)*
            whenArms+=ProjectionWhenArm*
        '}'
    );

/** Discriminant arm: `when e.type == "Hero" { … }`. */
ProjectionWhenArm:
    'when' when=Expression '{'
        (selectedFields+=ID | expansions+=Expansion | spreads+=FragmentSpread)*
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
// Equality is used for `each` / projection `when` filters (`s.type == "Hero"`).

Expression:
    Atom ({infer BinaryExpr.left=current} op=('==' | '!=') right=Atom)?;

Atom:
    Literal | IdentityRef | ContextRef | PathRef;

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
