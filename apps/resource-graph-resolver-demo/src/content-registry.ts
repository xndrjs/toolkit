import type { MockContentfulAsset, MockContentfulEntry } from "./mock-contentful-types.js";

/**
 * Demo ContentRegistry: ARI `type` is only `"entry" | "asset"`.
 * Field-level Entry typing happens after content-type parse/hydrate, not on the ARI.
 */
export type DemoContentRegistry = {
  entry: MockContentfulEntry;
  asset: MockContentfulAsset;
};
