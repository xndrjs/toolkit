# @xndrjs/domain

Validator-agnostic semantic modeling: **shapes** (trusted boundaries), **primitives**, **proofs** (semantic guarantees), and **capabilities** (behavior on the kit, not on instances).

This is the **successor** to the deprecated [`@xndrjs/branded`](../branded): same modeling ideas (frozen instances, kit-level capabilities, proofs), with validation behind a pluggable **`Validator`**. For **Zod 4**, use [@xndrjs/domain-zod](../domain-zod). **Other adapters** (additional engines and integrations) are **on the roadmap**, with some expected **very soon**.

**`domainCore`** groups the main factories: `shape`, `primitive`, `proof`, `capabilities`. Also exported at the package root: `pipe` and `DomainValidationError`. Types (`ShapeKit`, `Branded`, `Validator`, …) are exported at the root. Implementation details (`getShapePatchImpl`, `__brand`, `__patchImpl`, `__shapeMarker`) stay internal to the package.

Use a pluggable `Validator` (e.g. via [@xndrjs/domain-zod](../domain-zod) `domainZod.fromZod`) at boundaries.

## License

MIT
