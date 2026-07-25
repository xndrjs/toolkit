# @xndrjs/application-resources

## 0.1.0

### Minor Changes

- Initial stable release of **Application Resource Identifiers** (ARIs): framework-agnostic resource IDs for the application layer (loading, invalidation, logging, authorization, events) without tying the vocabulary to a cache library.
  - **`ari(type, ...keyParts)`** — create an ARI with a resource family and zero or more structural key parts (primitives or flat objects; optional dimensions as `null`).
  - **`toArray()` / `format()` / `equals()`** — adapter-friendly projection, stable string form, and structural equality.
  - **`omitNullKeyFields()`** — project `[type, ...key]` for wider cache matching when adapters need to drop `null` open dimensions.
  - Keys are cloned and frozen so caller mutations cannot affect the stored identifier.
