# Minimal query surface; barrels via filesIn

Wave 1 query API is only: instances of a construct, artifacts of an instance, and `filesIn(dirRef, includeSelf?: boolean)` with `includeSelf` defaulting to `false`. Sync barrels (e.g. `models/index.ts`) select managed file artifacts that reference a directory, not instances filtered by dependency. Including `self` is opt-in to avoid accidental self-referential generators. Richer filters (by dependency, provenance) stay out of wave 1 unless a concrete requirement appears.
