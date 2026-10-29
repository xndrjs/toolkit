import type { AnyProvider } from "../../alias-intent.js";

/** ParamsReq declared on `.perContext<P>()` (`void` when undeclared). */
type ProviderParamsOf<P> = "$params" extends keyof P
  ? P extends { readonly $params?: infer Params }
    ? [Exclude<Params, undefined>] extends [never]
      ? void
      : [Exclude<Params, undefined>] extends [void]
        ? void
        : Exclude<Params, undefined>
    : void
  : void;

type RegisteredParamsUnion<
  Surface extends Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[],
> =
  | { [K in keyof Surface]: ProviderParamsOf<Surface[K]> }[keyof Surface]
  | (Providers[number] extends infer P
      ? P extends AnyProvider
        ? ProviderParamsOf<P>
        : never
      : never);

/** Keys present on both A and B whose value types intersect to `never`. */
type ConflictingParamKeys<A, B> = {
  [K in keyof A & keyof B]: [A[K] & B[K]] extends [never]
    ? [A[K]] extends [never]
      ? never
      : [B[K]] extends [never]
        ? never
        : K
    : never;
}[keyof A & keyof B];

type ParamsPairConflict<A, B> = [A] extends [void]
  ? never
  : [B] extends [void]
    ? never
    : ConflictingParamKeys<A, B>;

/**
 * Pairwise conflicts across a union of ParamsReq object types.
 * Distributes over the union so every pair is checked.
 */
type ParamsUnionConflicts<U, All = U> = U extends unknown
  ? ParamsPairConflict<U, Exclude<All, U>> extends infer C
    ? C extends string
      ? C
      : never
    : never
  : never;

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never;

/**
 * Merged host params bag inferred from all registered Providers' ParamsReq.
 * `void` when no Provider declared a non-void requirement.
 */
export type InferredParams<
  Surface extends Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[],
> =
  Exclude<RegisteredParamsUnion<Surface, Providers>, void> extends infer Objects
    ? [Objects] extends [never]
      ? void
      : UnionToIntersection<Objects>
    : void;

declare const formaParamsConflicts: unique symbol;
declare const formaParamsExplicitTooNarrow: unique symbol;

/**
 * Intersected into `compose` options: incompatible ParamsReq keys across Providers
 * (same key, types whose intersection is `never`).
 */
export type AssertParamsCompatible<
  Surface extends Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[],
> =
  ParamsUnionConflicts<Exclude<RegisteredParamsUnion<Surface, Providers>, void>> extends infer Bad
    ? [Bad] extends [never]
      ? unknown
      : {
          readonly [formaParamsConflicts]: `Incompatible execution params key(s): ${Extract<Bad, string>}`;
        }
    : unknown;

/**
 * When using `compose<Explicit>()`, Explicit must cover the inferred ParamsReq merge
 * (host bag is a superset). `void` inferred → no constraint.
 */
export type AssertExplicitParamsCover<
  Explicit,
  Surface extends Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[],
> =
  InferredParams<Surface, Providers> extends infer Inferred
    ? [Inferred] extends [void]
      ? unknown
      : [Explicit] extends [Inferred]
        ? unknown
        : {
            readonly [formaParamsExplicitTooNarrow]: "compose<Explicit>() Explicit params do not satisfy provider ParamsReq";
          }
    : unknown;
