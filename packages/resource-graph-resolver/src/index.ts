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
  NoDataSourceError,
  ResourceGraphAbortedError,
  ResourceGraphError,
  ResourceLoadFailedError,
} from "./errors";
export { createStrategy, type GraphStrategy } from "./strategy/create-strategy";
export type { ExpansionContext, ExpansionResult } from "./ports/expansion-port";
export type { IslandContext, IslandResult } from "./ports/island-port";
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
  defineDataSourceFor,
  type PendingResourceBatch,
  type ResourceBatchSizeMap,
  type ResourceFamily,
  type ResourceFamilyMap,
  type ResourceLoadContext,
  type ResourceOfFamily,
  type DataSource,
  type DataSourceDefinition,
  type SourceResourceRecord,
} from "./ports/data-source";
export { serializeAllIslands, serializeIsland } from "./islands/serialize-island";
export type {
  ComposeContentRegistry,
  ContentRegistry,
  IslandId,
  MissingResourceMode,
  RegistryPayloadFor,
  ResolutionError,
  SchedulingMode,
  ResolveResourceGraphInput,
  ResolveResourceGraphOutput,
  ResolvedResourceRecord,
  ResourceKey,
  SerializedIsland,
} from "./types";
export type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
