import {
  createRawArrayExampleDataSources,
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
          if (resource.type === "RawArrayBatch") {
            return itemIds.map((id) => ({ id }));
          }

          return {
            id: resource.key.id,
            title: `Item ${resource.key.id}`,
          };
        }),
    },
  });

  return resolveRawArrayExample({
    params: { batchId },
    sources,
  });
}
