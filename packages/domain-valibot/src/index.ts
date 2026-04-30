/**
 * Valibot adapter for `@xndrjs/domain`: use `valibotToValidator` and `valibotFromKit`.
 * Re-exports `@xndrjs/domain` (including `domain` namespace + types) for single-entry imports.
 */
export { valibotToValidator } from "./valibot-to-validator";
export { valibotFromKit } from "./valibot-from-kit";

export * from "@xndrjs/domain";
