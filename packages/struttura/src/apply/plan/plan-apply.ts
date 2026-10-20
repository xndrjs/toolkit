import type { DesiredInventory, Diagnostic } from "../../inventory/derive-desired-inventory";
import { artifactIdentity, type Manifest } from "../manifest";
import { planDeletions } from "./deletions";
import { planDirectory, planFile } from "./files-dirs";
import { coveredByDirectoryMoves, orderMoves, selectMoves } from "./moves";
import { comparePath, indexManifestArtifacts, pathDepth } from "./path-utils";
import type { PlanOp, PlanResult } from "./types";

export function planApply(input: {
  inventory: DesiredInventory;
  contents: ReadonlyMap<string, string>;
  lastManifest: Manifest | undefined;
  materializationRoot: string;
}): PlanResult {
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
  ops.push(...otherDeletes);

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
      diagnostics
    );
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }
  return { ok: true, ops };
}
