import type { Intent } from "./boundary.js";
import type { Provider } from "./provider.js";

/**
 * Registrable Provider with erased contract params so `compose` can accept a
 * heterogeneous `surface` / `wiring` list. Concrete Providers remain fully typed at aliases.
 */
// Type params appear in covariant and contravariant positions; erasure needs `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AnyProvider erasure
export type AnyProvider = Provider<string, string, any, any, any, any, boolean>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AnyIntent erasure for bindings
export type AnyIntent = Intent<string, string, any, any, any>;

declare const formaBindingBrand: unique symbol;

/**
 * Explicit composition association produced only by {@link bind}.
 * Preserves concrete Intent types so `compose` can rewrite requirements.
 * Raw `[required, satisfier]` tuples are not assignable (brand).
 */
export type BindingPair<
  Req extends AnyIntent = AnyIntent,
  Sat extends AnyIntent = AnyIntent,
> = readonly [Req, Sat] & {
  readonly [formaBindingBrand]: void;
};

/** Erased binding pair for heterogeneous `wiring` arrays. */
export type Binding = BindingPair;

/** One entry in `compose({ wiring })`: a Provider or a {@link bind} alias. */
export type WiringEntry = AnyProvider | Binding;

/**
 * `Sat` when Req and Sat Intent contracts are mutually assignable
 * (structural equivalence of Input / Success / Err); otherwise `never`.
 */
type SameContract<Req, Sat> =
  Req extends Intent<string, string, infer RI, infer RS, infer RE>
    ? Sat extends Intent<string, string, infer SI, infer SS, infer SE>
      ? [RI, SI] extends [SI, RI]
        ? [RS, SS] extends [SS, RS]
          ? [RE, SE] extends [SE, RE]
            ? Sat
            : never
          : never
        : never
      : never
    : never;

/**
 * Associate a required Intent with a satisfier Intent whose contract is
 * structurally equivalent. Use the result in `compose({ wiring })`.
 *
 * ```ts
 * wiring: [SelectOrderProvider, bind(FindOrder, SelectOrder)]
 * ```
 */
export function bind<Req extends AnyIntent, Sat extends AnyIntent>(
  required: Req,
  satisfier: SameContract<Req, Sat>
): BindingPair<Req, Sat> {
  return [required, satisfier] as unknown as BindingPair<Req, Sat>;
}

/** Runtime partition: {@link bind} pairs are arrays; Providers are objects. */
export function isBinding(entry: WiringEntry): entry is Binding {
  return Array.isArray(entry);
}

/** Type-level: Providers from a `wiring` tuple (Bindings dropped). */
export type ProvidersFromWiring<W extends readonly WiringEntry[]> = W extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Head extends Binding
    ? Tail extends readonly WiringEntry[]
      ? ProvidersFromWiring<Tail>
      : readonly []
    : Tail extends readonly WiringEntry[]
      ? readonly [Extract<Head, AnyProvider>, ...ProvidersFromWiring<Tail>]
      : readonly [Extract<Head, AnyProvider>]
  : readonly [];

/** Type-level: Bindings from a `wiring` tuple (Providers dropped). */
export type BindingsFromWiring<W extends readonly WiringEntry[]> = W extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Head extends Binding
    ? Tail extends readonly WiringEntry[]
      ? readonly [Head, ...BindingsFromWiring<Tail>]
      : readonly [Head]
    : Tail extends readonly WiringEntry[]
      ? BindingsFromWiring<Tail>
      : readonly []
  : readonly [];

export function partitionWiring(wiring: readonly WiringEntry[]): {
  providers: AnyProvider[];
  bindings: Binding[];
} {
  const providers: AnyProvider[] = [];
  const bindings: Binding[] = [];
  for (const entry of wiring) {
    if (isBinding(entry)) {
      bindings.push(entry);
    } else {
      providers.push(entry);
    }
  }
  return { providers, bindings };
}
