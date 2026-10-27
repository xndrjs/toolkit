export type {
  Candidate,
  CandidateData,
  DataFromPathPattern,
  DiscoveryHit,
  DiscoveryOptions,
  DiscoveryRule,
  EmptyCandidateData,
  PathParamNames,
} from "./discovery.js";
export {
  defaultIgnore,
  discoveryRule,
  listCandidates,
  resolveCandidate,
  resolveSubdir,
} from "./discovery.js";

export type {
  SyncContext,
  SyncDiscoveryApi,
  SyncGenerator,
  SyncPassResult,
  SyncRegion,
} from "./sync.js";
export { findRegionsInFile, runSyncPass } from "./sync.js";

export type { ConflictPolicy, PlopOs, PlopOsConfig } from "./runtime.js";
export { createPlopOs, plopAddFlags } from "./runtime.js";

export type { RunScaffoldArgs, RunScaffoldResult } from "./run-scaffold.js";
export { runScaffold } from "./run-scaffold.js";
