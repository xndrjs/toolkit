# @xndrjs/addressable-resources

## Unreleased

### Breaking Changes

- Renamed package from `@xndrjs/application-resources` to `@xndrjs/addressable-resources`.
- ARI identity is a single flat object key (`resource.key`), not a tuple (`resource.key[0]`).
- `ari(type, objectSchema)` requires exactly one `s.object({...})` (no empty / multi-segment forms).
- Canonical `toString()` format is `Type(field=value,...)` (lexicographic fields, JSON scalars).
- Replaced `stableStringifyResource` / `parseStableStringifyResource` with `formatAriString` / `parseAriString`.
- Renamed types to `AddressableResource*` / `addressableResourceKeySchema`; removed `s.tuple`.
