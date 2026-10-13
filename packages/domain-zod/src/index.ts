/**
 * Zod 4 adapter for `@xndrjs/domain`: top-level `domain.shape` / `primitive` / `proof` accept Zod
 * schemas only; `domain.core.*` takes a `Validator`. Also `zodToValidator` and `zodFromKit(kit)`.
 * Re-exports `@xndrjs/domain`; this package’s `domain` adds schema entry points on top of `core`.
 */
export { zodFromKit } from "./zod-from-kit";
export { zodToValidator } from "./zod-to-validator";

export * from "@xndrjs/domain";
/** Adapted `domain` — shadows the core re-export; top-level factories accept Zod schemas only. */
export { domain } from "./zod-domain";
