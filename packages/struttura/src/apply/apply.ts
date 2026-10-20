import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { Population } from "../population/create-population";
import {
  deriveDesiredInventory,
  type DesiredInventory,
  type Diagnostic,
} from "../inventory/derive-desired-inventory";
import { checkDefinitionStamp } from "../codegen/check-stamp";
import {
  buildManifest,
  manifestsEqual,
  readManifest,
  writeManifest,
  type Manifest,
} from "./manifest";
import { MOVE_TEMP_ROOT, planApply, type PlanOp } from "./plan";
import { renderFileContents } from "./render-contents";

export type ApplyOptions = {
  /** Absolute or cwd-relative path confined for artifact create/update/delete. */
  readonly materializationRoot: string;
  /**
   * Directory that owns support files. Last-successful manifest is written under
   * `{architectureDir}/.struttura/manifest.json` (ADR 0005).
   */
  readonly architectureDir: string;
};

export type ApplySuccess = {
  readonly ok: true;
  readonly inventory: DesiredInventory;
  readonly manifest: Manifest;
  readonly plan: readonly PlanOp[];
  /** False when re-apply matched and nothing was written (disk or manifest). */
  readonly mutated: boolean;
};

export type ApplyFailure = {
  readonly ok: false;
  readonly diagnostics: readonly Diagnostic[];
};

export type ApplyResult = ApplySuccess | ApplyFailure;

/**
 * Reconcile the materialization root against the population and record the last
 * successful apply in the architecture support directory.
 */
export function apply(population: Population, options: ApplyOptions): ApplyResult {
  const materializationRoot = resolve(options.materializationRoot);
  const architectureDir = resolve(options.architectureDir);

  const stale = checkDefinitionStamp(population);
  if (stale) {
    return { ok: false, diagnostics: [stale] };
  }

  const derived = deriveDesiredInventory(population);
  if (!derived.ok) {
    return { ok: false, diagnostics: derived.diagnostics };
  }

  const contents = renderFileContents(population, derived.inventory);
  const lastManifest = readManifest(architectureDir);
  const planned = planApply({
    inventory: derived.inventory,
    contents,
    lastManifest,
    materializationRoot,
  });
  if (!planned.ok) {
    return { ok: false, diagnostics: planned.diagnostics };
  }

  mkdirSync(materializationRoot, { recursive: true });

  for (const op of planned.ops) {
    executeOp(op, materializationRoot);
  }

  cleanupMoveTempRoot(materializationRoot);

  const nextManifest = buildManifest(derived.inventory, architectureDir, materializationRoot);
  const manifestUnchanged =
    lastManifest !== undefined && manifestsEqual(lastManifest, nextManifest);
  if (!manifestUnchanged) {
    writeManifest(architectureDir, nextManifest);
  }

  return {
    ok: true,
    inventory: derived.inventory,
    manifest: nextManifest,
    plan: planned.ops,
    mutated: planned.ops.length > 0 || !manifestUnchanged,
  };
}

function executeOp(op: PlanOp, materializationRoot: string): void {
  if (op.type === "move") {
    const fromAbs = join(materializationRoot, op.from);
    const toAbs = join(materializationRoot, op.to);
    mkdirSync(dirname(toAbs), { recursive: true });
    renameSync(fromAbs, toAbs);
    return;
  }

  const abs = join(materializationRoot, op.path);
  if (op.type === "mkdir") {
    mkdirSync(abs, { recursive: true });
    return;
  }
  if (op.type === "delete") {
    // Directory artifacts wipe the full tree (foreign files included); file artifacts unlink only.
    rmSync(abs, { recursive: op.kind === "directory", force: true });
    return;
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, op.content, "utf8");
}

/** Remove empty staging directory left by crossed-path moves. */
function cleanupMoveTempRoot(materializationRoot: string): void {
  const tempRoot = join(materializationRoot, MOVE_TEMP_ROOT);
  if (!existsSync(tempRoot)) {
    return;
  }
  try {
    rmSync(tempRoot, { recursive: true, force: true });
  } catch {
    // Best-effort: an interrupt may leave entries; the next replan recovers via temps.
  }
}
