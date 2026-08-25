export {
  buildBackingResourcesFromIslands,
  type BackingResourcesIslandPolicy,
  type BackingResourceConflict,
  type BackingResourcesFromIslandsOptions,
} from "./islands/build-backing-resources";
export { ContentMap } from "./model/content-map";
export {
  createResourceGraphResolver,
  type ResourceGraphResolver,
  type ResourceGraphResolverConfig,
} from "./engines/resource-graph-resolver";
export {
  MissingResourceError,
  NoResourceSourceError,
  ResourceGraphAbortedError,
  ResourceGraphError,
  ResourceLoadFailedError,
} from "./errors";
export {
  createExpansionPolicyChain,
  defineExpansionPolicy,
  type ExpansionContext,
  type ExpansionPolicy,
  type ExpansionPort,
  type ExpansionResourceFor,
  type ExpansionResult,
} from "./ports/expansion-port";
export { IslandDependencyMap } from "./model/island-dependency-map";
export { IslandMap } from "./model/island-map";
export type {
  BackingPromoteEvent,
  MissingResourceEvent,
  ResolutionEndEvent,
  ResolutionObserver,
  ResolutionStartEvent,
  ResourceBatchEndEvent,
  ResourceBatchErrorEvent,
  ResourceBatchStartEvent,
  ResourceExpandEvent,
} from "./observability/resolution-observer";
export {
  defineResourceSourceFor,
  type PendingResourceBatch,
  type ResourceBatchSizeMap,
  type ResourceFamily,
  type ResourceFamilyMap,
  type ResourceLoadContext,
  type ResourceOfFamily,
  type ResourceSource,
  type ResourceSourceDefinition,
  type SourceResourceRecord,
} from "./ports/resource-source";
export { serializeAllIslands, serializeIsland } from "./islands/serialize-island";
export type {
  ComposeContentRegistry,
  ContentRegistry,
  IslandId,
  MissingResourceMode,
  RegistryPayloadFor,
  ResolutionError,
  ResolutionStrategy,
  ResolveResourceGraphInput,
  ResolveResourceGraphOutput,
  ResolvedResourceRecord,
  ResourceKey,
  SerializedIsland,
} from "./types";
export type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
