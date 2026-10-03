import {
  createRawArrayExampleDataSources,
  rawArrayBatchAri,
  rawArrayItemAri,
  resolveRawArrayExample,
  Scalars,
  type ResolveRawArrayExampleResult,
} from "../generated";

const batchId = Scalars.RawArrayBatchId("demo-batch");
const itemIds = [Scalars.RawArrayItemId("first"), Scalars.RawArrayItemId("second")];

/** Minimal runnable example for a raw array payload used by `resolve to each`. */
export function resolveRawArrayDemo(): Promise<ResolveRawArrayExampleResult> {
  const sources = createRawArrayExampleDataSources({
    RawArrayDemo: {
      load: async (batch) =>
        batch.map((resource) => {
          if (rawArrayBatchAri.matches(resource)) {
            return itemIds.map((id) => ({ id }));
          }

          if (rawArrayItemAri.matches(resource)) {
            const id = Scalars.RawArrayItemId(resource.key.id);
            return {
              id,
              title: `Item ${id}`,
            };
          }

          return undefined;
        }),
    },
  });

  return resolveRawArrayExample({
    params: { batchId },
    sources,
  });
}
