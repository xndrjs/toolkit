import type { Intent, IntentIdentity } from "../../boundary.js";
import type { AnyIntent, AnyProvider, IntentAlias } from "../../alias-intent.js";
import type {
  EquivalentIntentContract,
  LifetimePolicy,
  Provider,
} from "../../provider/provider.js";

/**
 * Type-level Intent identity: structured `(boundaryId, intentName)`.
 * Not a concatenated label — (`"a.b"`, `"c"`) ≠ (`"a"`, `"b.c"`).
 */
type IntentKey = IntentIdentity;

type IntentKeyOf<I> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Intent contract erasure
  I extends Intent<infer B, infer N, any, any, any, any>
    ? IntentIdentity<Extract<B, string>, Extract<N, string>>
    : never;

type ProviderIntentKey<P> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Provider contract erasure
  P extends Provider<infer B, infer N, any, any, any, any, LifetimePolicy, any, any>
    ? IntentIdentity<Extract<B, string>, Extract<N, string>>
    : never;

type ProviderIntentOf<P> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Provider contract extraction
  P extends Provider<infer B, infer N, infer I, infer S, infer E, any, LifetimePolicy, any, infer M>
    ? Intent<Extract<B, string>, Extract<N, string>, I, S, E, M>
    : never;

type ProviderDepsOf<P> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Provider contract extraction
  P extends Provider<string, string, any, any, any, infer Deps, LifetimePolicy, any, any>
    ? Deps
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
  P extends Provider<string, string, any, any, any, infer Deps, LifetimePolicy, any, any>
    ? IsEmptyDeps<Deps> extends true
      ? never
      : { [K in keyof Deps]: IntentKeyOf<Deps[K]> }[keyof Deps]
    : never;

/** Lifetime policy declared locally by a Provider. */
type ProviderLifetimePolicy<P> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Provider contract erasure
  P extends Provider<string, string, any, any, any, any, infer Policy, any, any> ? Policy : "auto";

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
 * Direct Intent-key edges where an explicitly `.perComposition()` Provider
 * depends on a `.perContext()` Provider. Transitive conflicts are validated by
 * the runtime graph planner, which is the authoritative check.
 */
type InvalidPinnedLifetimeEdgeKeys<
  Surface extends Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[],
  Aliases extends readonly IntentAlias[],
> =
  RegisteredProviders<Surface, Providers> extends infer Consumer
    ? Consumer extends AnyProvider
      ? [ProviderLifetimePolicy<Consumer>] extends ["composition"]
        ? ProviderDepKeys<Consumer> extends infer DepKey
          ? DepKey extends IntentKey
            ? RewriteRequirement<DepKey, Aliases> extends infer SatisfierKey
              ? SatisfierKey extends IntentKey
                ? ProviderForIntentKey<SatisfierKey, Surface, Providers> extends infer Sat
                  ? Sat extends AnyProvider
                    ? [ProviderLifetimePolicy<Sat>] extends ["context"]
                      ? `${FormatIntentKey<ProviderIntentKey<Consumer>>}→${FormatIntentKey<SatisfierKey>}`
                      : never
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
> = Aliases[number] extends infer Alias
  ? Alias extends readonly [infer Req, infer Sat]
    ? [IntentKeyOf<Req>] extends [Required]
      ? IntentKeyOf<Sat>
      : never
    : never
  : never;

type AliasSatisfierIntentFor<
  Required extends IntentKey,
  Aliases extends readonly IntentAlias[],
> = Aliases[number] extends infer Alias
  ? Alias extends readonly [infer Req, infer Sat]
    ? [IntentKeyOf<Req>] extends [Required]
      ? Extract<Sat, AnyIntent>
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

type ResolvedRequiredIntent<Required extends AnyIntent, Aliases extends readonly IntentAlias[]> =
  AliasSatisfierIntentFor<IntentKeyOf<Required>, Aliases> extends infer Satisfier
    ? [Satisfier] extends [never]
      ? Required
      : Extract<Satisfier, AnyIntent>
    : Required;

/** Registered edges whose resolved Provider does not implement the declared Contract exactly. */
type IncompatibleProviderContractEdges<
  Surface extends Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[],
  Aliases extends readonly IntentAlias[],
> =
  RegisteredProviders<Surface, Providers> extends infer Consumer
    ? Consumer extends AnyProvider
      ? ProviderDepsOf<Consumer> extends infer Deps
        ? {
            [K in keyof Deps]: Deps[K] extends AnyIntent
              ? ResolvedRequiredIntent<Deps[K], Aliases> extends infer Required extends AnyIntent
                ? ProviderForIntentKey<
                    IntentKeyOf<Required>,
                    Surface,
                    Providers
                  > extends infer Satisfier
                  ? Satisfier extends AnyProvider
                    ? EquivalentIntentContract<Required, ProviderIntentOf<Satisfier>> extends true
                      ? never
                      : `Intent ${FormatIntentKey<IntentKeyOf<Required>>} required by ${FormatIntentKey<ProviderIntentKey<Consumer>>}`
                    : never
                  : never
                : never
              : never;
          }[keyof Deps]
        : never
      : never
    : never;

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
 * Private keys for type-level graph asserts. Not exported: callers cannot
 * satisfy the phantom by adding a string property (only `@ts-expect-error` / casts).
 */
declare const formaMissingProviders: unique symbol;
declare const formaInvalidPinnedLifetimeEdges: unique symbol;
declare const formaIncompatibleProviderContracts: unique symbol;

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
 * Intersected into `compose` options: repeated declarations of one Intent
 * identity must carry an exactly equivalent Contract, including modality.
 */
export type AssertProviderContractsCompatible<
  Surface extends Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[],
  Aliases extends readonly IntentAlias[],
> =
  IncompatibleProviderContractEdges<Surface, Providers, Aliases> extends infer Bad
    ? [Bad] extends [never]
      ? unknown
      : {
          readonly [formaIncompatibleProviderContracts]: `Incompatible Contract for ${Extract<Bad, string>}`;
        }
    : unknown;

/**
 * Best-effort direct check: an explicit `.perComposition()` Provider cannot
 * depend directly on `.perContext()`. The graph planner validates transitive
 * and alias-mediated conflicts synchronously at `compose()`.
 */
export type AssertNoInvalidPinnedLifetimeEdges<
  Surface extends Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[],
  Aliases extends readonly IntentAlias[],
> =
  InvalidPinnedLifetimeEdgeKeys<Surface, Providers, Aliases> extends infer Bad
    ? [Bad] extends [never]
      ? unknown
      : {
          readonly [formaInvalidPinnedLifetimeEdges]: `Invalid lifetime pin(s): .perComposition() provider(s) depend directly on .perContext(): ${Extract<Bad, string>}`;
        }
    : unknown;
