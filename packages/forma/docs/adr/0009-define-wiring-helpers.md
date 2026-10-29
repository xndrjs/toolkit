# 0009. `defineWiring` helpers and Provider-union rejection

## Status

Accepted

## Context

`compose` validates the closed graph with const-generic wiring tuples. An inline
`wiring: [A, B]` keeps Provider precision. Extracting a plain array widens to
`Provider[]`; type-level `ProvidersFromWiring` then treats the list as empty and
reports a false “Missing provider.” Annotating a concrete bag as public
`ComposeOptions` widens Surface and Wiring the other way and can hide incomplete
graphs. A Provider union in one registration slot makes every branch’s Intent look
registered while runtime materializes only one.

## Decision

- Add `defineWiring(...entries)` with const generics so extracted wiring stays a
  precise tuple (equivalent intent to `as const` on a tuple literal).
- Add `defineComposition({ surface, wiring? })` to preserve a precise options bag
  and apply the same compile-time asserts at the definition site.
- Document that annotating configs as bare `ComposeOptions` is a footgun; prefer
  inference, `defineWiring`, or `defineComposition`.
- PoC policy: reject Provider unions on surface aliases and in wiring Provider
  slots at compose types (no “every variant closes the graph” check).

## Consequences

- Modular wiring can keep static completeness checks without inlining every
  Provider at the `compose` call.
- Dynamic Provider choice must resolve to one concrete Provider before compose
  (or use separate compositions). Binding aliases are unchanged.
