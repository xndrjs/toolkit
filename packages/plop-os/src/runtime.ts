import type {
  Candidate,
  CandidateData,
  DiscoveryOptions,
  DiscoveryRule,
  EmptyCandidateData,
} from "./discovery.js";
import {
  defaultIgnore,
  discoveryRule,
  findRule,
  listCandidates,
  resolveCandidate,
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
  /** Infer `Candidate.data` from a path-to-regexp `pattern` string literal. */
  addDiscoveryRule: {
    <const P extends string>(rule: DiscoveryRuleFromPattern<P>): void;
    <TData extends CandidateData>(rule: DiscoveryRule<TData>): void;
  };
  syncGenerator: (id: string, fn: SyncGenerator) => void;
  candidates: <TData extends CandidateData = EmptyCandidateData>(
    ruleName: string,
    baseDir?: string
  ) => Candidate<TData>[];
  resolveCandidate: <TData extends CandidateData = EmptyCandidateData>(
    ruleName: string,
    inputPath: string,
    baseDir?: string
  ) => Candidate<TData>;
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

  function addDiscoveryRule(rule: DiscoveryRule<CandidateData>): void {
    rules.push(discoveryRule(rule));
  }

  const api: PlopOs = {
    discovery,
    rules,
    syncGenerators,
    addDiscoveryRule: addDiscoveryRule as PlopOs["addDiscoveryRule"],
    syncGenerator(id, fn) {
      syncGenerators.set(id, fn);
    },
    candidates(ruleName, baseDir) {
      return listCandidates(discovery, findRule(rules, ruleName), baseDir) as never;
    },
    resolveCandidate(ruleName, inputPath, baseDir) {
      return resolveCandidate(discovery, findRule(rules, ruleName), inputPath, baseDir) as never;
    },
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
