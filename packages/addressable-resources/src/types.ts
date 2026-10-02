export type AddressableResourcePrimitive = string | number | boolean | null;

/** Flat object identity key — values are serializable primitives only (no nesting). */
export type AddressableResourceKey = Record<string, AddressableResourcePrimitive>;

export interface AddressableResourceIdentifier<
  Type extends string = string,
  Key extends AddressableResourceKey = AddressableResourceKey,
> {
  readonly type: Type;
  readonly key: Key;

  /** Adapter projection `[type, key]` (e.g. TanStack Query). Not multi-segment identity. */
  toArray(): readonly [Type, Key];

  /** Canonical stable identity string (map keys, cache, dedup). */
  toString(): string;

  equals(other: AddressableResourceIdentifier): boolean;
}

type IsAddressableResourceKey<T> = [T] extends [never]
  ? true
  : [T] extends [AddressableResourceKey]
    ? true
    : false;

export type AssertValidAddressableResourceKey<Key> =
  IsAddressableResourceKey<Key> extends true ? Key : never;
