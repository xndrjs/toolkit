export { createEdgeKey } from "./graph/create-edge-key";
export { defineConfig } from "./config/index";
export { createId, discoverArchitectureGraph } from "./discovery/index";
export { ArchitectureGraphError } from "./graph/errors";
export { mergeGraphFragments } from "./graph/merge";
export { validateArchitectureGraph } from "./graph/validate";
export { cleanArchitecturePreset } from "./presets/clean-architecture";
export type { ArchitectureGraphDocument, GordioConfig } from "./config/index";
export type {
  DiscoveryContext,
  DiscoveryOptions,
  FileMatcher,
  FileParser,
  FileParserResult,
  MatchedFile,
} from "./discovery/index";
export type {
  ArchitectureBox,
  ArchitectureEdge,
  ArchitectureGraph,
  ArchitectureId,
  ArchitectureNode,
  ArchitectureViewSchema,
  BoxKindDefinition,
  EdgeKey,
  GraphFragment,
  LaneDefinition,
  NodeKindDefinition,
  SlotDefinition,
} from "./graph/types";
