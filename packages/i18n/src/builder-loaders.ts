/** Canonical lazy loader — no locale or delivery-area partition. */
export type CanonicalLoader<T> = () => Promise<T> | T;

/** Split-by-locale or custom-area loader — partition key is locale or area name. */
export type PartitionedLoader<T> = (partition: string) => Promise<T> | T;

export type NamespaceLoader<T> = CanonicalLoader<T> | PartitionedLoader<T>;

export async function invokeNamespaceLoader<T>(
  loader: NamespaceLoader<T>,
  partition: string | undefined
): Promise<T> {
  if (partition === undefined) {
    return await (loader as CanonicalLoader<T>)();
  }

  return await (loader as PartitionedLoader<T>)(partition);
}
