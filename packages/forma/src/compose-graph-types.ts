import type { Intent, IntentIdentity } from "./boundary.js";
import type { AnyProvider, IntentAlias, WiringEntry } from "./alias-intent.js";
import type { Provider } from "./provider.js";
import type { ReservedSurfaceAlias } from "./string-keys.js";

/**
 * Type-level Intent identity: structured `(boundaryId, intentName)`.
 * Not a concatenated label — (`"a.b"`, `"c"`) ≠ (`"a"`, `"b.c"`).
 */
type IntentKey = IntentIdentity;

type IntentKeyOf<I> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Intent contract erasure
  I extends Intent<infer B, infer N, any, any, any>
    ? IntentIdentity<Extract<B, string>, Extract<N, string>>
    : never;

type ProviderIntentKey<P> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Provider contract erasure
  P extends Provider<infer B, infer N, any, any, any, any, boolean, any>
    ? IntentIdentity<Extract<B, string>, Extract<N, string>>
    : never;

/** Display-only label for diagnostics (not used as identity). */
type FormatIntentKey<K> = K extends IntentIdentity<infer B, infer N> ? `${B}.${N}` : never;

type FormatIntentKeyUnion<K> = K extends unknown ? FormatIntentKey<K> : never;

type IsEmptyDeps<Deps> = [Deps] extends [Record<string, never>]
  ? [Record<string, never>] extends [Deps]
    ? true
    : false
  : false;

/** Direct `using` Intent keys on a Provider (empty when `using` was omitted). */
type ProviderDepKeys<P> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Provider contract erasure
  P extends Provider<string, string, any, any, any, infer Deps, boolean, any>
    ? IsEmptyDeps<Deps> extends true
      ? never
      : { [K in keyof Deps]: IntentKeyOf<Deps[K]> }[keyof Deps]
    : never;

/** `true` when the Provider is marked `.perContext()`; otherwise `false`. */
type ProviderIsPerContext<P> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Provider contract erasure
  P extends Provider<string, string, any, any, any, any, infer PC, any> ? PC : false;

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

type RegisteredProviders<
  Surface extends Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[],
> = Surface[keyof Surface] | Providers[number];

/** Registered provider whose Intent key matches `Key` (after identity resolution). */
type ProviderForIntentKey<
  Key extends IntentKey,
  Surface extends Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[],
> =
  RegisteredProviders<Surface, Providers> extends infer P
    ? P extends AnyProvider
      ? [ProviderIntentKey<P>] extends [Key]
        ? P
        : never
      : never
    : never;

/**
 * Intent-key edges where a composition-lifetime provider `using`s a dependency
 * satisfied by a `.perContext()` provider (illegal capture; spec §6 / §15.7).
 */
type InvalidLifetimeEdgeKeys<
  Surface extends Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[],
  Aliases extends readonly IntentAlias[],
> =
  RegisteredProviders<Surface, Providers> extends infer Consumer
    ? Consumer extends AnyProvider
      ? [ProviderIsPerContext<Consumer>] extends [true]
        ? never
        : ProviderDepKeys<Consumer> extends infer DepKey
          ? DepKey extends IntentKey
            ? RewriteRequirement<DepKey, Aliases> extends infer SatisfierKey
              ? SatisfierKey extends IntentKey
                ? ProviderForIntentKey<SatisfierKey, Surface, Providers> extends infer Sat
                  ? Sat extends AnyProvider
                    ? [ProviderIsPerContext<Sat>] extends [true]
                      ? `${FormatIntentKey<ProviderIntentKey<Consumer>>}→${FormatIntentKey<SatisfierKey>}`
                      : never
                    : never
                  : never
                : never
              : never
            : never
          : never
      : never
    : never;

type RegisteredIntentKeys<
  Surface extends Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[],
> =
  | { [K in keyof Surface]: ProviderIntentKey<Surface[K]> }[keyof Surface]
  | (Providers[number] extends infer P
      ? P extends AnyProvider
        ? ProviderIntentKey<P>
        : never
      : never);

type RequiredIntentKeys<
  Surface extends Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[],
> =
  | { [K in keyof Surface]: ProviderDepKeys<Surface[K]> }[keyof Surface]
  | (Providers[number] extends infer P
      ? P extends AnyProvider
        ? ProviderDepKeys<P>
        : never
      : never);

type AliasSatisfierFor<
  Required extends IntentKey,
  Aliases extends readonly IntentAlias[],
> = Aliases extends readonly [infer Head, ...infer Tail]
  ? Head extends readonly [infer Req, infer Sat]
    ? [IntentKeyOf<Req>] extends [Required]
      ? IntentKeyOf<Sat>
      : Tail extends readonly IntentAlias[]
        ? AliasSatisfierFor<Required, Tail>
        : never
    : never
  : never;

type RewriteRequirement<Required extends IntentKey, Aliases extends readonly IntentAlias[]> =
  AliasSatisfierFor<Required, Aliases> extends infer Sat
    ? [Sat] extends [never]
      ? Required
      : Sat extends IntentKey
        ? Sat
        : Required
    : Required;

type RewriteAllRequirements<
  Required,
  Aliases extends readonly IntentAlias[],
> = Required extends IntentKey ? RewriteRequirement<Required, Aliases> : never;

/**
 * Intent keys required by registered providers after intent-alias rewrite that still
 * have no registered provider (PoC: missing-provider exhaustiveness).
 */
type MissingProviderKeys<
  Surface extends Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[],
  Aliases extends readonly IntentAlias[],
> = Exclude<
  RewriteAllRequirements<RequiredIntentKeys<Surface, Providers>, Aliases>,
  RegisteredIntentKeys<Surface, Providers>
>;

/**
 * Private keys for type-level compose asserts. Not exported: callers cannot
 * satisfy the phantom by adding a string property (only `@ts-expect-error` / casts).
 */
declare const formaMissingProviders: unique symbol;
declare const formaInvalidLifetimeEdges: unique symbol;
declare const formaReservedSurfaceKeys: unique symbol;
declare const formaNonStringSurfaceKeys: unique symbol;
declare const formaProviderUnions: unique symbol;
// formaParamsConflicts / formaParamsExplicitTooNarrow declared with params helpers above.

/**
 * `true` when `T` is a union of two or more constituents.
 * Used to reject Provider unions in surface / wiring slots (PoC policy).
 */
type IsUnion<T, U = T> = (T extends unknown ? ([U] extends [T] ? 0 : 1) : never) extends 0
  ? false
  : true;

/** Surface alias keys whose value is a Provider union. */
type SurfaceProviderUnionKeys<Surface extends Record<string, AnyProvider>> = {
  [K in keyof Surface & string]: IsUnion<Surface[K]> extends true ? K : never;
}[keyof Surface & string];

/**
 * Walk a wiring tuple slot-by-slot. Heterogeneous `[A, B]` is fine;
 * a single slot typed as `A | B` is not (would falsely register both Intents).
 * `[Head] extends [IntentAlias]` is intentional: a naked `Head extends IntentAlias`
 * would distribute over a Provider union and miss the union slot.
 */
type WiringProviderUnionSlots<W extends readonly WiringEntry[]> = W extends readonly [
  infer Head,
  ...infer Tail,
]
  ? [Head] extends [IntentAlias]
    ? Tail extends readonly WiringEntry[]
      ? WiringProviderUnionSlots<Tail>
      : never
    : IsUnion<Head> extends true
      ? true
      : Tail extends readonly WiringEntry[]
        ? WiringProviderUnionSlots<Tail>
        : never
  : never;

type ForbiddenSurfaceAliases<Surface> = Extract<keyof Surface & string, ReservedSurfaceAlias>;

type NonStringSurfaceKeys<Surface> = Exclude<keyof Surface, string>;

/**
 * Intersected into `compose` options: when the graph is incomplete, requires a
 * phantom property so the call is a compile error (use `@ts-expect-error` in tests).
 */
export type AssertProvidersComplete<
  Surface extends Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[],
  Aliases extends readonly IntentAlias[],
> =
  MissingProviderKeys<Surface, Providers, Aliases> extends infer Missing
    ? [Missing] extends [never]
      ? unknown
      : {
          readonly [formaMissingProviders]: `Missing provider for Intent(s): ${FormatIntentKeyUnion<Missing>}`;
        }
    : unknown;

/**
 * Intersected into `compose` options: composition-lifetime providers must not
 * depend on `.perContext()` providers (phantom property → compile error).
 */
export type AssertNoInvalidLifetimeEdges<
  Surface extends Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[],
  Aliases extends readonly IntentAlias[],
> =
  InvalidLifetimeEdgeKeys<Surface, Providers, Aliases> extends infer Bad
    ? [Bad] extends [never]
      ? unknown
      : {
          readonly [formaInvalidLifetimeEdges]: `Invalid lifetime edge(s): composition-lifetime provider(s) depend on .perContext(): ${Extract<Bad, string>}`;
        }
    : unknown;

/**
 * Intersected into `compose` options: surface aliases must be strings and must
 * not collide with reserved lifecycle names (`dispose`, `surface`).
 */
export type AssertSurfaceAliasesSafe<Surface extends Record<string, AnyProvider>> =
  ForbiddenSurfaceAliases<Surface> extends infer Reserved
    ? [Reserved] extends [never]
      ? [NonStringSurfaceKeys<Surface>] extends [never]
        ? unknown
        : {
            readonly [formaNonStringSurfaceKeys]: "Surface aliases must be string keys";
          }
      : {
          readonly [formaReservedSurfaceKeys]: `Surface alias(es) reserved for lifecycle: ${Extract<Reserved, string>}`;
        }
    : unknown;

/**
 * Intersected into `compose` options: a surface alias or wiring Provider slot
 * must not be a Provider union. Unions make every branch’s Intent look
 * registered while runtime materializes only one — PoC rejects them.
 */
export type AssertNoProviderUnions<
  Surface extends Record<string, AnyProvider>,
  Wiring extends readonly WiringEntry[],
> =
  SurfaceProviderUnionKeys<Surface> extends infer SurfaceKeys
    ? [SurfaceKeys] extends [never]
      ? [WiringProviderUnionSlots<Wiring>] extends [never]
        ? unknown
        : {
            readonly [formaProviderUnions]: "Provider unions are not allowed in wiring; register a single concrete Provider per slot";
          }
      : {
          readonly [formaProviderUnions]: `Provider unions are not allowed on surface alias(es): ${Extract<SurfaceKeys, string>}`;
        }
    : unknown;
