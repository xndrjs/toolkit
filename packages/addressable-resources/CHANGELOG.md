# @xndrjs/addressable-resources

## 0.1.0-alpha.0

### Minor Changes

- 3194a33: Rename `@xndrjs/application-resources` → `@xndrjs/addressable-resources` with a breaking ARI API and wire format. There is **no** re-export shim under the old name; deprecate the published `@xndrjs/application-resources` package on npm manually (`npm deprecate …`) and do not unpublish.

  ### Breaking (`@xndrjs/addressable-resources`)
  - Package rename: install `@xndrjs/addressable-resources` instead of `@xndrjs/application-resources`.
  - ARI identity is a single flat object key (`resource.key`), not a tuple (`resource.key[0]`).
  - `ari(type, objectSchema)` requires exactly one `s.object({...})` (no empty / multi-segment forms).
  - Canonical `toString()` format is `Type(field=value,...)` (lexicographic fields, JSON scalars).
  - Replaced `stableStringifyResource` / `parseStableStringifyResource` with `formatAriString` / `parseAriString`.
  - Renamed types to `AddressableResource*` / `addressableResourceKeySchema`; removed `s.tuple` and `ApplicationResource*` aliases.
  - Add `s.number()` for finite floats (`NaN` / `±Infinity` rejected) and `s.integer()` for finite integers (renames former `s.int()`).

  ### Dependents
  - `@xndrjs/resource-graph-resolver` and `@xndrjs/ziel` depend on and re-export the new package; update imports and `resource.key` access accordingly. Generated Ziel modules import from `@xndrjs/ziel` / `@xndrjs/addressable-resources`.

## Unreleased

### Breaking Changes

- Renamed package from `@xndrjs/application-resources` to `@xndrjs/addressable-resources`.
- ARI identity is a single flat object key (`resource.key`), not a tuple (`resource.key[0]`).
- `ari(type, objectSchema)` requires exactly one `s.object({...})` (no empty / multi-segment forms).
- Canonical `toString()` format is `Type(field=value,...)` (lexicographic fields, JSON scalars).
- Replaced `stableStringifyResource` / `parseStableStringifyResource` with `formatAriString` / `parseAriString`.
- Renamed types to `AddressableResource*` / `addressableResourceKeySchema`; removed `s.tuple`.
