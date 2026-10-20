import { existsSync } from "node:fs";
import { join } from "node:path";

import type {
  DesiredArtifact,
  DesiredInventory,
  Diagnostic,
} from "../../inventory/derive-desired-inventory";
import { artifactIdentity } from "../manifest";
import { comparePath, isPathUnder, pathDepth, relativeUnder } from "./path-utils";
import { MOVE_TEMP_ROOT, moveTempPath, type PlanOp, type PlannedMove } from "./types";

/**
 * Stable-identity path changes become moves. Nested artifacts whose relative path
 * under a moving directory is unchanged are covered by the directory tree move
 * (ADR 0007) and must not be moved a second time (analysis §15).
 */
export function selectMoves(
  inventory: DesiredInventory,
  previousById: ReadonlyMap<string, DesiredArtifact>,
  materializationRoot: string
): { moves: PlannedMove[]; alreadyAtDestination: Set<string> } {
  const candidates: PlannedMove[] = [];

  // Previous paths of identities that still need to leave that path (desired differs).
  const previousPathsStillOccupied = new Set<string>();
  for (const artifact of inventory.artifacts) {
    const previous = previousById.get(artifactIdentity(artifact));
    if (previous !== undefined && previous.path !== artifact.path) {
      previousPathsStillOccupied.add(previous.path);
    }
  }

  // Identities already at their destination (interrupt recovery) — still "relocated"
  // for planFile managed-path checks, even when no move op is emitted.
  const alreadyAtDestination = new Set<string>();

  for (const artifact of inventory.artifacts) {
    const identity = artifactIdentity(artifact);
    const previous = previousById.get(identity);
    if (previous === undefined || previous.path === artifact.path) {
      continue;
    }
    if (previous.kind !== artifact.kind) {
      continue;
    }

    const resolvedFrom = resolveMoveSource(
      previous.path,
      artifact.path,
      identity,
      materializationRoot,
      previousPathsStillOccupied
    );
    if (resolvedFrom === "already-at-destination") {
      alreadyAtDestination.add(identity);
      continue;
    }
    if (resolvedFrom === undefined) {
      // Source gone and not at dest/temp — create/restore later instead of moving.
      continue;
    }

    candidates.push({
      identity,
      from: resolvedFrom,
      to: artifact.path,
      kind: artifact.kind,
      instanceId: artifact.instanceId,
      artifactKey: artifact.artifactKey,
    });
  }

  const dirMoves = candidates
    .filter((m) => m.kind === "directory")
    .slice()
    .sort((a, b) => pathDepth(a.from) - pathDepth(b.from) || comparePath(a.from, b.from));

  const outermostDirs: PlannedMove[] = [];
  for (const dirMove of dirMoves) {
    if (
      outermostDirs.some(
        (ancestor) =>
          isPathUnder(dirMove.from, ancestor.from) &&
          relativeUnder(dirMove.from, ancestor.from) === relativeUnder(dirMove.to, ancestor.to)
      )
    ) {
      continue;
    }
    outermostDirs.push(dirMove);
  }

  const fileMoves = candidates
    .filter((m) => m.kind === "file")
    .filter((fileMove) => {
      return !outermostDirs.some(
        (dirMove) =>
          isPathUnder(fileMove.from, dirMove.from) &&
          relativeUnder(fileMove.from, dirMove.from) === relativeUnder(fileMove.to, dirMove.to)
      );
    });

  return { moves: [...outermostDirs, ...fileMoves], alreadyAtDestination };
}

/**
 * Locate the on-disk source for a move, including interrupt recovery via the
 * deterministic staging path (ADR 0006). Temp is checked before the destination
 * so a crossed-path interrupt mid-staging is not mistaken for completion.
 */
function resolveMoveSource(
  from: string,
  to: string,
  identity: string,
  materializationRoot: string,
  previousPathsStillOccupied: ReadonlySet<string>
): string | "already-at-destination" | undefined {
  const fromAbs = join(materializationRoot, from);
  if (existsSync(fromAbs)) {
    return from;
  }

  const temp = moveTempPath(identity);
  const tempAbs = join(materializationRoot, temp);
  if (existsSync(tempAbs)) {
    return temp;
  }

  const toAbs = join(materializationRoot, to);
  if (existsSync(toAbs) && !previousPathsStillOccupied.has(to)) {
    // Destination exists and is not another artifact's unresolved source path.
    return "already-at-destination";
  }

  return undefined;
}

export function coveredByDirectoryMoves(
  inventory: DesiredInventory,
  previousById: ReadonlyMap<string, DesiredArtifact>,
  dirAndFileMoves: readonly PlannedMove[]
): Set<string> {
  const dirMoves = dirAndFileMoves.filter((m) => m.kind === "directory");
  const covered = new Set<string>();

  for (const artifact of inventory.artifacts) {
    const identity = artifactIdentity(artifact);
    const previous = previousById.get(identity);
    if (previous === undefined || previous.path === artifact.path) {
      continue;
    }
    if (dirAndFileMoves.some((m) => m.identity === identity)) {
      continue;
    }
    const under = dirMoves.some(
      (dirMove) =>
        isPathUnder(previous.path, dirMove.from) &&
        relativeUnder(previous.path, dirMove.from) === relativeUnder(artifact.path, dirMove.to)
    );
    if (under) {
      covered.add(identity);
    }
  }

  return covered;
}

/**
 * Emit move ops in an order that handles crossed destinations via deterministic
 * temps under `.struttura-tmp/` (analysis §15). Refuse foreign occupants (ADR 0008).
 */
export function orderMoves(
  moves: readonly PlannedMove[],
  materializationRoot: string,
  inventory: DesiredInventory,
  clearedByLandingDelete: ReadonlySet<string>,
  diagnostics: Diagnostic[]
): PlanOp[] {
  if (moves.length === 0) {
    return [];
  }

  const byIdentity = new Map(inventory.artifacts.map((a) => [artifactIdentity(a), a]));
  const remaining: PlannedMove[] = moves.map((m) => ({ ...m }));
  const ops: PlanOp[] = [];
  const moveSources = new Set(moves.map((m) => m.from));

  for (const move of moves) {
    if (clearedByLandingDelete.has(move.to) || moveSources.has(move.to)) {
      // Landing delete frees the path, or another move vacates it via staging.
      continue;
    }
    const abs = join(materializationRoot, move.to);
    if (!existsSync(abs)) {
      continue;
    }
    // Destination occupied by a non-source path: foreign or leftover. Fail closed.
    const artifact = byIdentity.get(move.identity);
    diagnostics.push({
      code: "path-collision",
      message: `Cannot move artifact to "${move.to}": path already exists`,
      instanceId: move.instanceId,
      constructName: artifact?.constructName,
      artifactKey: move.artifactKey,
      path: move.to,
    });
  }
  if (diagnostics.length > 0) {
    return [];
  }

  while (remaining.length > 0) {
    const sources = new Set(remaining.map((m) => m.from));
    const ready = remaining.filter((m) => !sources.has(m.to));

    if (ready.length > 0) {
      ready.sort((a, b) => comparePath(a.from, b.from));
      for (const move of ready) {
        ops.push(moveOp(move));
        const index = remaining.findIndex((m) => m.identity === move.identity);
        remaining.splice(index, 1);
      }
      continue;
    }

    // Cycle: stage one artifact to its deterministic temp.
    const victim = remaining[0]!;
    if (victim.from.startsWith(`${MOVE_TEMP_ROOT}/`)) {
      ops.push(moveOp(victim));
      remaining.shift();
      continue;
    }

    const temp = moveTempPath(victim.identity);
    ops.push(
      moveOp({
        ...victim,
        to: temp,
      })
    );
    victim.from = temp;
  }

  return ops;
}

function moveOp(move: PlannedMove): PlanOp {
  return {
    type: "move",
    from: move.from,
    to: move.to,
    kind: move.kind,
    instanceId: move.instanceId,
    artifactKey: move.artifactKey,
  };
}
