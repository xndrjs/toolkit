grammar NaviQl

// Stub grammar for Langium scaffold. Grammar MVP (scalars, resources, queries)
// replaces this in the next Phase 2 milestone.

entry Model:
    declarations+=Declaration*;

Declaration:
    Placeholder;

Placeholder:
    'placeholder' name=ID ';';

hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z][\w_]*/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
