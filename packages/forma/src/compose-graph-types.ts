import type { Intent, IntentIdentity } from "./boundary.js";
import type { AnyProvider, Binding } from "./bind.js";
import type { Provider } from "./provider.js";

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
  P extends Provider<infer B, infer N, any, any, any, any, boolean>
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
  P extends Provider<string, string, any, any, any, infer Deps, boolean>
    ? IsEmptyDeps<Deps> extends true
      ? never
      : { [K in keyof Deps]: IntentKeyOf<Deps[K]> }[keyof Deps]
    : never;

/** `true` when the Provider is marked `.perContext()`; otherwise `false`. */
type ProviderIsPerContext<P> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Provider contract erasure
  P extends Provider<string, string, any, any, any, any, infer PC> ? PC : false;

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
  Bindings extends readonly Binding[],
> =
  RegisteredProviders<Surface, Providers> extends infer Consumer
    ? Consumer extends AnyProvider
      ? [ProviderIsPerContext<Consumer>] extends [true]
        ? never
        : ProviderDepKeys<Consumer> extends infer DepKey
          ? DepKey extends IntentKey
            ? RewriteRequirement<DepKey, Bindings> extends infer SatisfierKey
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

type BindingSatisfierFor<
  Required extends IntentKey,
  Bindings extends readonly Binding[],
> = Bindings extends readonly [infer Head, ...infer Tail]
  ? Head extends readonly [infer Req, infer Sat]
    ? [IntentKeyOf<Req>] extends [Required]
      ? IntentKeyOf<Sat>
      : Tail extends readonly Binding[]
        ? BindingSatisfierFor<Required, Tail>
        : never
    : never
  : never;

type RewriteRequirement<Required extends IntentKey, Bindings extends readonly Binding[]> =
  BindingSatisfierFor<Required, Bindings> extends infer Sat
    ? [Sat] extends [never]
      ? Required
      : Sat extends IntentKey
        ? Sat
        : Required
    : Required;

type RewriteAllRequirements<
  Required,
  Bindings extends readonly Binding[],
> = Required extends IntentKey ? RewriteRequirement<Required, Bindings> : never;

/**
 * Intent keys required by registered providers after binding rewrite that still
 * have no registered provider (PoC: missing-provider exhaustiveness).
 */
type MissingProviderKeys<
  Surface extends Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[],
  Bindings extends readonly Binding[],
> = Exclude<
  RewriteAllRequirements<RequiredIntentKeys<Surface, Providers>, Bindings>,
  RegisteredIntentKeys<Surface, Providers>
>;

/**
 * Private keys for type-level compose asserts. Not exported: callers cannot
 * satisfy the phantom by adding a string property (only `@ts-expect-error` / casts).
 */
declare const formaMissingProviders: unique symbol;
declare const formaInvalidLifetimeEdges: unique symbol;

/**
 * Intersected into `compose` options: when the graph is incomplete, requires a
 * phantom property so the call is a compile error (use `@ts-expect-error` in tests).
 */
export type AssertProvidersComplete<
  Surface extends Record<string, AnyProvider>,
  Providers extends readonly AnyProvider[],
  Bindings extends readonly Binding[],
> =
  MissingProviderKeys<Surface, Providers, Bindings> extends infer Missing
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
  Bindings extends readonly Binding[],
> =
  InvalidLifetimeEdgeKeys<Surface, Providers, Bindings> extends infer Bad
    ? [Bad] extends [never]
      ? unknown
      : {
          readonly [formaInvalidLifetimeEdges]: `Invalid lifetime edge(s): composition-lifetime provider(s) depend on .perContext(): ${Extract<Bad, string>}`;
        }
    : unknown;
