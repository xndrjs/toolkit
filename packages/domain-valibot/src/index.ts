/**
 * Valibot adapter for `@xndrjs/domain`: top-level `domain.shape` / `primitive` / `proof` accept Valibot
 * schemas only; `domain.core.*` takes a `Validator`. Also `valibotToValidator` and `valibotFromKit`.
 * Re-exports `@xndrjs/domain`; this package’s `domain` adds schema entry points on top of `core`.
 */
export { valibotToValidator } from "./valibot-to-validator";
export { valibotFromKit } from "./valibot-from-kit";

export * from "@xndrjs/domain";
/** Adapted `domain` — shadows the core re-export; top-level factories accept Valibot schemas only. */
export { domain } from "./valibot-domain";
