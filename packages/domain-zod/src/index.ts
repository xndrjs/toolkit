/**
 * Zod 4 adapter for `@xndrjs/domain`: `fromZod` builds a core `Validator` from a Zod schema.
 * Re-exports the full `@xndrjs/domain` public API so Zod-based apps can use one entry package.
 */
export { fromZod } from "./from-zod";

export * from "@xndrjs/domain";
