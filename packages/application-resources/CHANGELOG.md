# @xndrjs/application-resources

## 0.2.0-alpha.0

### Minor Changes

- d7da4f6: Breaking API cleanup for Application Resource Identifiers:
  - **`ari(type, ...schemas)`** replaces the former low-level **`ari(type, ...keyParts)`** constructor.
  - Instance **`toString()`** is the canonical identity string; **`format()`** removed.
  - Factory **`parseString` / `safeParseString`** and module **`parseStableStringifyResource`** for round-trip from stable strings.
  - **`DefinedAri`** renamed to **`AriFactory`**.
  - Identity is now computed once per instance and reused by `toString()` and `equals()`, so ARIs stay cheap to use as map keys in hot loops.

## Unreleased

### Minor Changes

- **`ari(type, ...schemas)`** is the standard API for typed resource families (replaces `defineAri` and the former low-level `ari(type, ...keyParts)` constructor).
- **`toString()`** on instances returns the canonical stable identity string (map keys, cache, dedup, logs).
- **`parseString` / `safeParseString`** on factories round-trip from `toString()` output.
- **`parseStableStringifyResource`** and exported **`stableStringifyResource`** for untyped parse/build.
- **`AriFactory`** type (replaces `DefinedAri`).

### Breaking Changes

- Removed **`format()`** and **`ApplicationResourceKeyFormatter`** — use **`toString()`** for identity strings.
- Removed low-level **`ari(type, ...keyParts)`** — use **`ari(type, schema)(...keyParts)`** instead.
- Renamed **`defineAri`** → **`ari`**; **`DefinedAri`** → **`AriFactory`**.

## 0.1.0

### Minor Changes

- Initial stable release of **Application Resource Identifiers** (ARIs): framework-agnostic resource IDs for the application layer (loading, invalidation, logging, authorization, events) without tying the vocabulary to a cache library.
  - **`ari(type, ...keyParts)`** — create an ARI with a resource family and zero or more structural key parts (primitives or flat objects; optional dimensions as `null`).
  - **`toArray()` / `format()` / `equals()`** — adapter-friendly projection, stable string form, and structural equality.
  - **`omitNullKeyFields()`** — project `[type, ...key]` for wider cache matching when adapters need to drop `null` open dimensions.
  - Keys are cloned and frozen so caller mutations cannot affect the stored identifier.
