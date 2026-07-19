/** Split-by-locale or custom-area loader — partition key is locale or area name. */
export type PartitionedLoader<T> = (
  partition: string,
  context: { locale: string }
) => Promise<T> | T;

export type NamespaceLoader<T> = PartitionedLoader<T>;

export async function invokeNamespaceLoader<T>(
  loader: NamespaceLoader<T>,
  partition: string,
  context: { locale: string }
): Promise<T> {
  return await loader(partition, context);
}
