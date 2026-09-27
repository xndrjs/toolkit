/**
 * Cached semantic model from the last workspace validate run.
 * Hover / completion / definition providers read this instead of re-collecting.
 */
import type { LangiumDocument } from "langium";

import type { ResourceTable, ScalarTable } from "../check/symbols";
import type { Program } from "../ir";

export type SemanticSnapshot = {
  /** Merged IR from files that parsed cleanly. */
  program: Program;
  scalars: ScalarTable;
  resources: ResourceTable;
  /** Langium documents keyed by URI (for AST / offset lookups). */
  documentsByUri: ReadonlyMap<string, LangiumDocument>;
};

/** Mutable cache shared by workspace validation and IntelliSense providers. */
export type SemanticSnapshotCache = {
  get(): SemanticSnapshot | undefined;
  set(snapshot: SemanticSnapshot | undefined): void;
};

export function createSemanticSnapshotCache(): SemanticSnapshotCache {
  let snapshot: SemanticSnapshot | undefined;
  return {
    get: () => snapshot,
    set: (next) => {
      snapshot = next;
    },
  };
}
