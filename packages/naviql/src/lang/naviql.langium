grammar NaviQl

// MVP surface matching Phase 1 IR / analysis PostDetail + page-detail.
// No comprehensions, islands, filters, unions, or when-clauses.

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

ResourceDeclaration:
    'resource' name=ID
        '(' (identity+=TypedField (',' identity+=TypedField)*)? ')'
        '{'
            payload+=PayloadField*
        '}';

TypedField:
    name=ID ':' type=TypeExpr;

/** Bare `id` inherits identity type; `title: string` is an explicit type. */
PayloadField:
    name=ID (':' type=TypeExpr)?;

/**
 * Types: primitives, scalar refs, inline objects, and postfix arrays.
 * `string[]`, `{ name: string; }[]`, nested objects — left-associative `[]`.
 */
TypeExpr:
    AtomicTypeExpr ({infer ArrayTypeExpr.of=current} '[' ']')*;

AtomicTypeExpr:
    PrimitiveTypeExpr | ScalarTypeExpr | ObjectTypeExpr;

PrimitiveTypeExpr:
    name=PrimitiveName;

ScalarTypeExpr:
    name=ID;

/** Inline structural object; optional `;` after each field (TS-like). */
ObjectTypeExpr:
    '{' (fields+=TypedField ';'?)* '}';

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
    'expand' alias=ID ':' target=ResourceConstruction;

ResourceConstruction:
    resource=ID '(' (args+=NamedArg (',' args+=NamedArg)*)? ')';

NamedArg:
    name=ID ':' value=Expression;

// --- Expressions -------------------------------------------------------------
// Path shapes are classified during lowering (param vs payloadRef).
// `context.path` and `@binding[.path]` are dedicated forms (context is a keyword).

Expression:
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
