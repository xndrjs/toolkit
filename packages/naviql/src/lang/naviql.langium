grammar NaviQl

// MVP surface: scalars, resources (`Name(identity): payloadType`), queries,
// expansions with optional comprehensions (`for … in … if …`).
// No islands or projection `when`-clauses.

entry Model:
    declarations+=Declaration*;

Declaration:
    ScalarDeclaration | ResourceDeclaration | QueryDeclaration;

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
    PrimitiveTypeExpr | NamedTypeExpr | ObjectTypeExpr | StringLiteralTypeExpr | GroupedTypeExpr;

PrimitiveTypeExpr:
    name=PrimitiveName;

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
            root=RootClause
            projections+=ProjectionClause*
        '}';

ContextBlock:
    'context' '{' fields+=TypedField* '}';

RootClause:
    'root' construction=ResourceConstruction;

ProjectionClause:
    'on' resource=ID binding=ID '{'
        (selectedFields+=ID | expansions+=Expansion)*
    '}';

Expansion:
    'expand' alias=ID ':' (
        '[' target=ResourceConstruction comprehension=ComprehensionTail ']'
      | target=ResourceConstruction
    );

/** `for item in source if filter` — used inside `[ … ]` many-expansions. */
ComprehensionTail:
    'for' itemBinding=ID 'in' source=Expression ('if' filter=Expression)?;

ResourceConstruction:
    resource=ID '(' (args+=NamedArg (',' args+=NamedArg)*)? ')';

NamedArg:
    name=ID ':' value=Expression;

// --- Expressions -------------------------------------------------------------
// Path shapes are classified during lowering (param / payloadRef / itemRef).
// `context.path` and `@binding[.path]` are dedicated forms (context is a keyword).
// Equality is only needed for comprehension filters (`s.type == "Hero"`).

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
