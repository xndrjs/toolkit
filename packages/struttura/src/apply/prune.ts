import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import type { Population } from "../population/create-population";
import {
  deriveDesiredInventory,
  type DesiredInventory,
  type Diagnostic,
} from "../inventory/derive-desired-inventory";
import { checkDefinitionStamp } from "../codegen/check-stamp";
import {
  buildManifest,
  computeZombies,
  manifestsEqual,
  readManifest,
  writeManifest,
  type Manifest,
  type ManifestArtifact,
} from "./manifest";
import { cleanupMoveTempRoot, executeOp } from "./apply";
import { planDeletions } from "./plan/deletions";
import type { PlanOp } from "./plan/types";

export type PruneOptions = {
  readonly materializationRoot: string;
  readonly structureDir: string;
};

export type PruneSuccess = {
  readonly ok: true;
  readonly inventory: DesiredInventory;
  readonly manifest: Manifest;
  readonly plan: readonly PlanOp[];
  readonly mutated: boolean;
  /** Always empty after a successful prune. */
  readonly zombies: readonly ManifestArtifact[];
};

export type PruneFailure = {
  readonly ok: false;
  readonly diagnostics: readonly Diagnostic[];
};

export type PruneResult = PruneSuccess | PruneFailure;

/**
 * Delete zombie managed artifacts and clear them from the success manifest (ADR 0015).
 * Does not create, move, or sync desired artifacts — run `apply` for that.
 */
export function prune(population: Population, options: PruneOptions): PruneResult {
  const materializationRoot = resolve(options.materializationRoot);
  const structureDir = resolve(options.structureDir);

  const stale = checkDefinitionStamp(population);
  if (stale) {
    return { ok: false, diagnostics: [stale] };
  }

  const derived = deriveDesiredInventory(population);
  if (!derived.ok) {
    return { ok: false, diagnostics: derived.diagnostics };
  }

  const lastManifest = readManifest(structureDir);
  const zombies = computeZombies(derived.inventory, lastManifest);
  const ops: PlanOp[] = [];
  planDeletions(derived.inventory, lastManifest, materializationRoot, ops);

  mkdirSync(materializationRoot, { recursive: true });
  for (const op of ops) {
    executeOp(op, materializationRoot);
  }
  cleanupMoveTempRoot(materializationRoot);

  const nextManifest = buildManifest(derived.inventory, structureDir, materializationRoot, {
    zombies: [],
  });
  const manifestUnchanged =
    lastManifest !== undefined && manifestsEqual(lastManifest, nextManifest);
  if (!manifestUnchanged) {
    writeManifest(structureDir, nextManifest);
  }

  return {
    ok: true,
    inventory: derived.inventory,
    manifest: nextManifest,
    plan: ops,
    mutated: ops.length > 0 || !manifestUnchanged,
    zombies: [],
  };
}
