---
"@xndrjs/application-resources": minor
---

Breaking API cleanup for Application Resource Identifiers:

- **`ari(type, ...schemas)`** replaces the former low-level **`ari(type, ...keyParts)`** constructor.
- Instance **`toString()`** is the canonical identity string; **`format()`** removed.
- Factory **`parseString` / `safeParseString`** and module **`parseStableStringifyResource`** for round-trip from stable strings.
- **`DefinedAri`** renamed to **`AriFactory`**.
- Identity is now computed once per instance and reused by `toString()` and `equals()`, so ARIs stay cheap to use as map keys in hot loops.
