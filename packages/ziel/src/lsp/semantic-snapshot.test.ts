import { describe, expect, it } from "vitest";

import { createSemanticSnapshotCache } from "./semantic-snapshot";
import type { Program } from "../ir";

const EMPTY_PROGRAM: Program = {
  scalars: [],
  opaques: [],
  resources: [],
  fragments: [],
  datasources: [],
  queries: [],
  span: null,
};

describe("SemanticSnapshotCache", () => {
  it("starts empty and round-trips set/get/clear", () => {
    const cache = createSemanticSnapshotCache();
    expect(cache.get()).toBeUndefined();

    const snapshot = {
      program: EMPTY_PROGRAM,
      scalars: new Map(),
      opaques: new Map(),
      resources: new Map(),
      documentsByUri: new Map(),
    };
    cache.set(snapshot);
    expect(cache.get()).toBe(snapshot);

    cache.set(undefined);
    expect(cache.get()).toBeUndefined();
  });
});
