# @xndrjs/domain

Validator-agnostic semantic modeling: **shapes** (trusted boundaries), **primitives**, **proofs** (semantic guarantees), and **capabilities** (behavior on the kit, not on instances).

**`domainCore`** groups the main factories: `shape`, `primitive`, `proof`, `capabilities`. Also exported at the package root: `pipe`, `DomainValidationError`, `getShapePatchImpl`, and the internal symbols (`__brand`, `__patchImpl`, `__shapeMarker`). Types (`ShapeKit`, `Branded`, `Validator`, …) are exported at the root.

Use a pluggable `Validator` (e.g. via [@xndrjs/domain-zod](../domain-zod) `domainZod.fromZod`) at boundaries.

## License

MIT
