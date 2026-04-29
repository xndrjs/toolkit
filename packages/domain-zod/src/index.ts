/**
 * Zod 4 adapter for `@xndrjs/domain`: use {@link domainZod} for `fromZod`, Zod-backed `primitive` / `shape`, and `field`.
 * Re-exports `@xndrjs/domain` ({@link domainCore} + types) so Zod-based apps can use one entry package.
 * Zod-specific value exports: {@link domainZod} only; types: {@link ZodPrimitiveKit}, {@link ZodShapeKit}.
 */
export { domainZod } from "./domain-zod";

export type { ZodPrimitiveKit, ZodShapeKit } from "./zod-kit";

export * from "@xndrjs/domain";
