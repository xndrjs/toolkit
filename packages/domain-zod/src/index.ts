/**
 * Zod 4 adapter for `@xndrjs/domain`: use `zodToValidator` and `zodFromKit`.
 * Re-exports `@xndrjs/domain` (including `domain` namespace + types) for single-entry imports.
 */
export { zodFromKit } from "./zod-from-kit";
export { zodToValidator } from "./zod-to-validator";

export * from "@xndrjs/domain";
