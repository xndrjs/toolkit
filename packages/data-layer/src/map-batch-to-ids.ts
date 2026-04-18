/**
 * Maps an unordered batch result back to the original `ids` order.
 * Duplicate keys in `results` keep the last occurrence in the internal lookup.
 *
 * Missing ids use `notFoundFactory(id)`. Uses `Map.has` so a present value of
 * `undefined` is still treated as found.
 */
export function mapBatchToIds<K extends string | number, V, E extends Error = Error>(
  requestedIds: readonly K[],
  results: readonly V[],
  keySelector: (item: V) => K,
  notFoundFactory?: (id: K) => E
): (V | E)[] {
  const resolveMissing: (id: K) => E =
    notFoundFactory ?? ((id: K) => new Error(`Resource ${String(id)} not found`) as E);

  const lookup = new Map<K, V>();
  for (const item of results) {
    lookup.set(keySelector(item), item);
  }

  return requestedIds.map((id) => (lookup.has(id) ? (lookup.get(id) as V) : resolveMissing(id)));
}
