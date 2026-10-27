import type { DiscoveryOptions, DiscoveryRule } from "./discovery.js";
import {
  defaultIgnore,
  findRule,
  listCandidates,
  resolveCandidate,
  resolveSubdir,
} from "./discovery.js";
import type { SyncGenerator, SyncPassResult } from "./sync.js";
import { runSyncPass } from "./sync.js";

export type ConflictPolicy = "skip" | "overwrite" | "throw";

export type PlopOsConfig = {
  roots?: string[];
  ignore?: string[];
};

export type PlopOs = {
  discovery: DiscoveryOptions;
  rules: DiscoveryRule[];
  syncGenerators: Map<string, SyncGenerator>;
  addDiscoveryRule: (rule: DiscoveryRule) => void;
  syncGenerator: (id: string, fn: SyncGenerator) => void;
  candidates: (ruleName: string, baseDir?: string) => ReturnType<typeof listCandidates>;
  resolveCandidate: (
    ruleName: string,
    inputPath: string,
    baseDir?: string
  ) => ReturnType<typeof resolveCandidate>;
  resolveSubdir: typeof resolveSubdir;
  sync: (opts?: { id?: string; baseDir?: string }) => Promise<SyncPassResult>;
};

export function createPlopOs(config: PlopOsConfig = {}): PlopOs {
  const discovery: DiscoveryOptions = {
    roots: config.roots ?? [process.cwd()],
    ignore: config.ignore ?? defaultIgnore(),
  };
  const rules: DiscoveryRule[] = [];
  const syncGenerators = new Map<string, SyncGenerator>();

  const api: PlopOs = {
    discovery,
    rules,
    syncGenerators,
    addDiscoveryRule(rule) {
      rules.push(rule);
    },
    syncGenerator(id, fn) {
      syncGenerators.set(id, fn);
    },
    candidates(ruleName, baseDir) {
      return listCandidates(discovery, findRule(rules, ruleName), baseDir);
    },
    resolveCandidate(ruleName, inputPath, baseDir) {
      return resolveCandidate(discovery, findRule(rules, ruleName), inputPath, baseDir);
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

/** Map conflict policy to Plop `add` flags. */
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
