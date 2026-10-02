export {
  buildBackingResourcesFromIslands,
  type BackingResourcesIslandPolicy,
  type BackingResourceConflict,
  type BackingResourcesFromIslandsOptions,
} from "./islands/build-backing-resources";
export { ContentMap } from "./model/content-map";
export { DEFAULT_RESOLUTION_BUDGET } from "./engines/resolution-budget";
export {
  createResourceGraphResolver,
  type ResourceGraphResolver,
  type ResourceGraphResolverConfig,
} from "./engines/resource-graph-resolver";
export {
  MissingResourceError,
  NoDataSourceError,
  ResolutionError,
  ResourceBatchLengthError,
  ResourceGraphAbortedError,
  ResourceGraphBudgetExceededError,
  ResourceGraphError,
  ResourceLoadFailedError,
  ResourceRedirectCycleError,
  toResolutionErrorData,
  type ResolutionErrorData,
} from "./errors";
export {
  createGraphResolutionStrategy,
  type GraphResolutionStrategy,
  type GraphResolutionStrategyBuilder,
} from "./strategy/create-graph-resolution-strategy";
export type { ExpansionContext, ExpansionResult } from "./ports/expansion-port";
export { stricterOnFailure } from "./ports/expansion-port";
export type { IslandContext, IslandResult } from "./ports/island-port";
export type { ResolveContext, ResolveResult } from "./ports/resolve-port";
export { IslandDependencyMap } from "./model/island-dependency-map";
export { IslandMap } from "./model/island-map";
export type {
  BackingPromoteEvent,
  MissingResourceEvent,
  ResolutionEndEvent,
  ResolutionBudgetExceededEvent,
  ResolutionObserver,
  ResolutionStartEvent,
  ResourceBatchEndEvent,
  ResourceBatchErrorEvent,
  ResourceBatchStartEvent,
  ResourceExpandEvent,
} from "./observability/resolution-observer";
export {
  defineDataSourceFor,
  type ResourceFamily,
  type ResourceLoadContext,
  type ResourceOfFamily,
  type ResourceUnionFromFamilies,
  type SourcePayloadSlot,
  type SourceRouteContext,
  type DataSource,
  type DataSourceDefinition,
} from "./ports/data-source";
export { serializeAllIslands, serializeIsland } from "./islands/serialize-island";
export type {
  ComposeContentRegistry,
  ContentRegistry,
  IslandId,
  OnFailurePolicy,
  ResolutionBudget,
  ResolutionBudgetKind,
  ResolutionBudgetOptions,
  ResolutionBudgetUsage,
  RegistryPayloadFor,
  SchedulingMode,
  ResolveResourceGraphInput,
  ResolveResourceGraphOutput,
  ResourceKey,
  SerializedIsland,
} from "./types";
export type { AddressableResourceIdentifier } from "@xndrjs/addressable-resources";
