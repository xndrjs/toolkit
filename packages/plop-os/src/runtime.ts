import type {
  Candidate,
  CandidateData,
  DiscoveryOptions,
  DiscoveryRule,
  DiscoveryRuleRef,
  EmptyCandidateData,
} from "./discovery.js";
import {
  defaultIgnore,
  discoveryRule,
  listCandidates,
  resolveCandidate,
  resolveRuleRef,
  resolveSubdir,
  type DataFromPathPattern,
} from "./discovery.js";
import type { SyncGenerator, SyncPassResult } from "./sync.js";
import { runSyncPass } from "./sync.js";

export type ConflictPolicy = "skip" | "overwrite" | "throw";

export type PlopOsConfig = {
  roots?: string[];
  ignore?: string[];
};

type DiscoveryRuleFromPattern<P extends string> = {
  name: string;
  pattern: P;
  extract?: undefined;
  label?: (hit: { path: string; data: DataFromPathPattern<P> }) => string;
  filter?: (hit: { path: string; data: DataFromPathPattern<P> }) => boolean;
};

export type PlopOs = {
  discovery: DiscoveryOptions;
  rules: DiscoveryRule<CandidateData>[];
  syncGenerators: Map<string, SyncGenerator>;
  /**
   * Register a Discovery rule and return the typed handle.
   * Pass the handle to `candidates` / Sync `listCandidates` to keep `data` inferred.
   * Regex / extract rules: supply `TData` explicitly (escape hatch).
   */
  addDiscoveryRule: {
    <const P extends string>(
      rule: DiscoveryRuleFromPattern<P>
    ): DiscoveryRule<DataFromPathPattern<P>>;
    <TData extends CandidateData>(rule: DiscoveryRule<TData>): DiscoveryRule<TData>;
  };
  syncGenerator: (id: string, fn: SyncGenerator) => void;
  candidates: {
    <TData extends CandidateData>(rule: DiscoveryRule<TData>, baseDir?: string): Candidate<TData>[];
    <TData extends CandidateData = EmptyCandidateData>(
      ruleName: string,
      baseDir?: string
    ): Candidate<TData>[];
  };
  resolveCandidate: {
    <TData extends CandidateData>(
      rule: DiscoveryRule<TData>,
      inputPath: string,
      baseDir?: string
    ): Candidate<TData>;
    <TData extends CandidateData = EmptyCandidateData>(
      ruleName: string,
      inputPath: string,
      baseDir?: string
    ): Candidate<TData>;
  };
  resolveSubdir: typeof resolveSubdir;
  sync: (opts?: { id?: string; baseDir?: string }) => Promise<SyncPassResult>;
};

/**
 * Consumer-facing runtime: Discovery config, rule / Sync registration, and Sync execution.
 * Wire this from the plopfile (the only required config entrypoint).
 */
export function createPlopOs(config: PlopOsConfig = {}): PlopOs {
  const discovery: DiscoveryOptions = {
    roots: config.roots ?? [process.cwd()],
    ignore: config.ignore ?? defaultIgnore(),
  };
  const rules: DiscoveryRule<CandidateData>[] = [];
  const syncGenerators = new Map<string, SyncGenerator>();

  function addDiscoveryRule<TData extends CandidateData>(
    rule: DiscoveryRule<TData>
  ): DiscoveryRule<TData> {
    const normalized = discoveryRule(rule);
    // Registry is erased to CandidateData; the returned handle keeps TData.
    rules.push(normalized as unknown as DiscoveryRule<CandidateData>);
    return normalized;
  }

  function candidates<TData extends CandidateData>(
    ruleOrName: DiscoveryRuleRef<TData>,
    baseDir?: string
  ): Candidate<TData>[] {
    return listCandidates(discovery, resolveRuleRef(rules, ruleOrName), baseDir);
  }

  function resolveCandidateBound<TData extends CandidateData>(
    ruleOrName: DiscoveryRuleRef<TData>,
    inputPath: string,
    baseDir?: string
  ): Candidate<TData> {
    return resolveCandidate(discovery, resolveRuleRef(rules, ruleOrName), inputPath, baseDir);
  }

  const api: PlopOs = {
    discovery,
    rules,
    syncGenerators,
    addDiscoveryRule: addDiscoveryRule as PlopOs["addDiscoveryRule"],
    syncGenerator(id, fn) {
      syncGenerators.set(id, fn);
    },
    candidates: candidates as PlopOs["candidates"],
    resolveCandidate: resolveCandidateBound as PlopOs["resolveCandidate"],
    resolveSubdir,
    async sync(opts = {}) {
      return runSyncPass({
        discovery,
        rules,
        generators: syncGenerators,
        syncId: opts.id,
        baseDir: opts.baseDir,
      });
    },
  };

  return api;
}

/** Map Conflict policy to Plop `add` flags. Default policy is conceptually `throw`. */
export function plopAddFlags(policy: ConflictPolicy): {
  skipIfExists?: boolean;
  force?: boolean;
} {
  switch (policy) {
    case "skip":
      return { skipIfExists: true };
    case "overwrite":
      return { force: true };
    case "throw":
      return {};
  }
}
