import { __brand } from "../private-constants";

export type Mutable<T> = { -readonly [K in keyof T]: T[K] };
/** Partial props or a mutating callback for branded shape `patch`. */
export type PatchDelta<T> = Partial<T> | ((draft: Mutable<T>) => void);

/**
 * Type-only nominal marker via {@link __brand}; **not** present on runtime objects (shapes / proof values).
 */
interface Brand<B extends string> {
  readonly [__brand]: Readonly<Record<B, true>>;
}

/**
 * Base brand utility for custom nominal typing with composable brand maps.
 * Keep it low-level and build domain aliases on top.
 * @typeParam B - Brand name (first, aligned with `primitive` / `shape` runtime args).
 * @typeParam T - Base type being branded.
 */
export type Branded<B extends string, T> = T & Brand<B>;

/**
 * Extracts the brand literal from a {@link Branded} type (first type argument).
 */
export type BrandOf<T> = T extends Branded<infer B extends string, infer _> ? B : never;
