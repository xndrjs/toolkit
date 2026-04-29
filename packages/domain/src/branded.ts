import { __brand } from "./private-constants";

export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Partial props or mutating callback for shape patch (draft is mutable). */
export type PatchDelta<T> = Partial<T> | ((draft: Mutable<T>) => void);

export type BrandMap<Name extends string> = Readonly<Record<Name, true>>;

export interface Brand<Name extends string> {
  readonly [__brand]: BrandMap<Name>;
}

export type Branded<Name extends string, T> = T & Brand<Name>;

export type BrandOf<T> = T extends Branded<infer B extends string, infer _> ? B : never;
