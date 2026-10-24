import type { DesiredInventory, Diagnostic } from "../../inventory/derive-desired-inventory";
import { artifactIdentity, type Manifest } from "../manifest";
import { planDeletions } from "./deletions";
import { planDirectory, planFile } from "./files-dirs";
import { coveredByDirectoryMoves, orderMoves, selectMoves } from "./moves";
import { comparePath, indexManifestArtifacts, pathDepth } from "./path-utils";
import type { PlanOp, PlanResult } from "./types";

export type PlanApplyOptions = {
  readonly inventory: DesiredInventory;
  readonly contents: ReadonlyMap<string, string>;
  readonly lastManifest: Manifest | undefined;
  readonly materializationRoot: string;
  /**
   * When true, delete managed artifacts absent from Desired (ADR 0015).
   * Default false — orphans become zombies on the manifest instead.
   */
  readonly prune?: boolean;
  /**
   * When false, skip Sync content rewrites for existing files (still create missing).
   * Default true.
   */
  readonly sync?: boolean;
};

export function planApply(input: PlanApplyOptions): PlanResult {
  const prune = input.prune ?? false;
  const sync = input.sync ?? true;
  const diagnostics: Diagnostic[] = [];
  const ops: PlanOp[] = [];
  const previousById = indexManifestArtifacts(input.lastManifest);

  const { moves, alreadyAtDestination } = selectMoves(
    input.inventory,
    previousById,
    input.materializationRoot
  );
  const moveDestinations = new Set(moves.map((m) => m.to));
  const movedIdentities = new Set([...moves.map((m) => m.identity), ...alreadyAtDestination]);
  const coveredIdentities = coveredByDirectoryMoves(input.inventory, previousById, moves);

  const deleteOps: PlanOp[] = [];
  planDeletions(input.inventory, input.lastManifest, input.materializationRoot, deleteOps);

  // Clear landing zones before moves, then move, then remaining deletes (analysis §15).
  // Landing deletes always run (move hygiene). Other deletes run only when prune is on.
  const landingDeletes: PlanOp[] = [];
  const otherDeletes: PlanOp[] = [];
  for (const op of deleteOps) {
    if (op.type === "delete" && moveDestinations.has(op.path)) {
      landingDeletes.push(op);
    } else {
      otherDeletes.push(op);
    }
  }

  ops.push(...landingDeletes);
  const clearedByLandingDelete = new Set(
    landingDeletes.filter((op) => op.type === "delete").map((op) => op.path)
  );
  const orderedMoves = orderMoves(
    moves,
    input.materializationRoot,
    input.inventory,
    clearedByLandingDelete,
    diagnostics
  );
  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }
  ops.push(...orderedMoves);
  if (prune) {
    ops.push(...otherDeletes);
  }

  const directories = input.inventory.artifacts
    .filter((a) => a.kind === "directory")
    .slice()
    .sort((a, b) => pathDepth(a.path) - pathDepth(b.path) || comparePath(a.path, b.path));

  const files = input.inventory.artifacts
    .filter((a) => a.kind === "file")
    .slice()
    .sort((a, b) => comparePath(a.path, b.path));

  for (const artifact of directories) {
    const identity = artifactIdentity(artifact);
    if (movedIdentities.has(identity) || coveredIdentities.has(identity)) {
      continue;
    }
    planDirectory(artifact, input.materializationRoot, ops, diagnostics);
  }

  for (const artifact of files) {
    planFile(
      artifact,
      input,
      previousById,
      movedIdentities,
      coveredIdentities,
      moves,
      ops,
      diagnostics,
      { sync }
    );
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }
  return { ok: true, ops };
}
