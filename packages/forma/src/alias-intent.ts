import type { Intent } from "./boundary.js";
import type { LifetimePolicy, Provider } from "./provider/provider.js";

/**
 * Registrable Provider with erased contract params so `compose` can accept a
 * heterogeneous `surface` / `wiring` list. Concrete Providers remain fully typed at aliases.
 */
// Type params appear in covariant and contravariant positions; erasure needs `any`.
/* eslint-disable @typescript-eslint/no-explicit-any -- AnyProvider erasure */
export type AnyProvider = Provider<
  string,
  string,
  any,
  any,
  any,
  any,
  LifetimePolicy,
  any,
  any,
  any
>;
/* eslint-enable @typescript-eslint/no-explicit-any */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AnyIntent erasure for intent aliases
export type AnyIntent = Intent<string, string, any, any, any, any>;

declare const formaIntentAliasBrand: unique symbol;

/**
 * Explicit composition association produced only by {@link aliasIntent}.
 * Preserves concrete Intent types so `compose` can rewrite requirements.
 * Raw `[required, satisfier]` tuples are not assignable (brand).
 */
export type IntentAliasPair<
  Req extends AnyIntent = AnyIntent,
  Sat extends AnyIntent = AnyIntent,
> = readonly [Req, Sat] & {
  readonly [formaIntentAliasBrand]: void;
};

/** Erased intent-alias pair for heterogeneous `wiring` arrays. */
export type IntentAlias = IntentAliasPair;

/** One entry in `compose({ wiring })`: a Provider or an {@link aliasIntent} entry. */
export type WiringEntry = AnyProvider | IntentAlias;

/**
 * `Sat` when Req and Sat Intent contracts are mutually assignable
 * (structural equivalence of Input / Success|Item / Err **and modality**);
 * otherwise `never`. Unary↔stream aliases are rejected.
 */
type SameContract<Req, Sat> =
  Req extends Intent<string, string, infer RI, infer RS, infer RE, infer RM>
    ? Sat extends Intent<string, string, infer SI, infer SS, infer SE, infer SM>
      ? [RM, SM] extends [SM, RM]
        ? [RI, SI] extends [SI, RI]
          ? [RS, SS] extends [SS, RS]
            ? [RE, SE] extends [SE, RE]
              ? Sat
              : never
            : never
          : never
        : never
      : never
    : never;

/**
 * Rare identity alias: rewrite a required Intent identity to a satisfier whose
 * contract is structurally equivalent. Prefer an Adapter (or same-boundary
 * Provider) passthrough for cross-boundary same-shape wiring; reserve this for
 * deliberate synonyms (rename / migration). Use the result in `compose({ wiring })`.
 *
 * ```ts
 * wiring: [SelectOrderProvider, aliasIntent(FindOrder, SelectOrder)]
 * ```
 */
export function aliasIntent<Req extends AnyIntent, Sat extends AnyIntent>(
  required: Req,
  satisfier: SameContract<Req, Sat>
): IntentAliasPair<Req, Sat> {
  return [required, satisfier] as unknown as IntentAliasPair<Req, Sat>;
}

/** Runtime partition: {@link aliasIntent} pairs are arrays; Providers are objects. */
export function isIntentAlias(entry: WiringEntry): entry is IntentAlias {
  return Array.isArray(entry);
}

/** Type-level: Providers from a `wiring` tuple (Intent aliases dropped). */
export type ProvidersFromWiring<W extends readonly WiringEntry[]> = W extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Head extends IntentAlias
    ? Tail extends readonly WiringEntry[]
      ? ProvidersFromWiring<Tail>
      : readonly []
    : Tail extends readonly WiringEntry[]
      ? readonly [Extract<Head, AnyProvider>, ...ProvidersFromWiring<Tail>]
      : readonly [Extract<Head, AnyProvider>]
  : readonly [];

/** Type-level: Intent aliases from a `wiring` tuple (Providers dropped). */
export type AliasesFromWiring<W extends readonly WiringEntry[]> = W extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Head extends IntentAlias
    ? Tail extends readonly WiringEntry[]
      ? readonly [Head, ...AliasesFromWiring<Tail>]
      : readonly [Head]
    : Tail extends readonly WiringEntry[]
      ? AliasesFromWiring<Tail>
      : readonly []
  : readonly [];

export function partitionWiring(wiring: readonly WiringEntry[]): {
  providers: AnyProvider[];
  aliases: IntentAlias[];
} {
  const providers: AnyProvider[] = [];
  const aliases: IntentAlias[] = [];
  for (const entry of wiring) {
    if (isIntentAlias(entry)) {
      aliases.push(entry);
    } else {
      providers.push(entry);
    }
  }
  return { providers, aliases };
}
