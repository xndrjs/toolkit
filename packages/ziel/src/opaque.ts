/**
 * Nominal opaque types for Ziel payloads.
 *
 * Tokens from {@link defineOpaqueType} brand values at the TypeScript level only.
 * `wrap` / `unwrap` are identity trust boundaries — they never clone, validate,
 * or attach runtime brand properties.
 */

declare const opaqueBrand: unique symbol;

/** Compile-time branded payload value; representation remains `unknown` at runtime. */
export type Opaque<Name extends string> = unknown & { readonly [opaqueBrand]: Name };

/** Runtime token + wrap/unwrap boundary for a named opaque type. */
export interface OpaqueType<Name extends string> {
  readonly name: Name;
  wrap(value: unknown): Opaque<Name>;
  unwrap(value: Opaque<Name>): unknown;
}

/** Extract the branded value type from an {@link OpaqueType} token. */
export type OpaqueValueOf<T> = T extends OpaqueType<infer Name> ? Opaque<Name> : never;

/**
 * Create an immutable opaque token used by codegen and composition roots.
 *
 * `wrap` and `unwrap` return the input value unchanged (`Object.is` identity).
 */
export function defineOpaqueType<const Name extends string>(name: Name): OpaqueType<Name> {
  return Object.freeze({
    name,
    wrap(value: unknown): Opaque<Name> {
      return value as Opaque<Name>;
    },
    unwrap(value: Opaque<Name>): unknown {
      return value;
    },
  });
}

/**
 * Per-composition-root registry mapping opaque tokens to translators.
 * Distinct from generated `ContentRegistry` (resource payloads).
 */
export interface OpaqueRegistry<Output> {
  register<T extends OpaqueType<string>>(
    type: T,
    translator: (value: OpaqueValueOf<T>) => Output
  ): this;

  translate<T extends OpaqueType<string>>(type: T, value: OpaqueValueOf<T>): Output;

  has<T extends OpaqueType<string>>(type: T): boolean;
}

/** Create an empty opaque translator registry keyed by opaque tokens. */
export function createOpaqueRegistry<Output>(): OpaqueRegistry<Output> {
  const translators = new Map<OpaqueType<string>, (value: unknown) => Output>();

  const registry: OpaqueRegistry<Output> = {
    register(type, translator) {
      if (translators.has(type)) {
        throw new Error(`Opaque type "${type.name}" is already registered`);
      }
      translators.set(type, translator as (value: unknown) => Output);
      return registry;
    },

    translate(type, value) {
      const translator = translators.get(type);
      if (translator === undefined) {
        throw new Error(`No translator registered for opaque type "${type.name}"`);
      }
      return translator(value);
    },

    has(type) {
      return translators.has(type);
    },
  };

  return registry;
}
