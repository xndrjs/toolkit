export {
  buildBackingResourcesFromIslands,
  type BackingResourcesIslandPolicy,
  type BackingResourceConflict,
  type BackingResourcesFromIslandsOptions,
} from "./islands/build-backing-resources";
export { ContentMap } from "./model/content-map";
export {
  createDataResolutionPull,
  type DataResolutionPort,
  type DataResolutionPull,
} from "./ports/data-resolution-port";
export { LaneResolveContentGraphEngine } from "./engines/lane-resolve-content-graph-engine";
export { ResolveContentGraphAbortedError } from "./errors";
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
export { BarrierResolveContentGraphEngine } from "./engines/barrier-resolve-content-graph-engine";
export type { ResourceLoader } from "./ports/resource-loader";
export { serializeAllIslands, serializeIsland } from "./islands/serialize-island";
export type {
  ContentRegistry,
  IslandId,
  MissingResourceMode,
  RegistryPayloadFor,
  ResolutionError,
  ResolveContentGraphInput,
  ResolveContentGraphOutput,
  ResolvedResourceRecord,
  ResourceKey,
  SerializedIsland,
} from "./types";
export type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
