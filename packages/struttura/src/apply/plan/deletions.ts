import { existsSync, lstatSync } from "node:fs";
import { join } from "node:path";

import type { DesiredArtifact, DesiredInventory } from "../../inventory/derive-desired-inventory";
import { artifactIdentity, type Manifest } from "../manifest";
import { comparePath, isPathUnder, pathDepth } from "./path-utils";
import type { PlanOp } from "./types";

/**
 * Drop only previously managed artifacts that are absent from the desired inventory.
 * Directory artifacts recurse (including foreign files); file artifacts do not own
 * their parent directory lifecycle (analysis §14, ADR 0007).
 */
export function planDeletions(
  inventory: DesiredInventory,
  lastManifest: Manifest | undefined,
  materializationRoot: string,
  ops: PlanOp[]
): void {
  if (lastManifest === undefined) {
    return;
  }

  const desiredIds = new Set(inventory.artifacts.map((a) => artifactIdentity(a)));
  const removed = lastManifest.artifacts.filter((a) => !desiredIds.has(artifactIdentity(a)));
  if (removed.length === 0) {
    return;
  }

  const removedDirs = removed
    .filter((a) => a.kind === "directory")
    .slice()
    .sort((a, b) => pathDepth(a.path) - pathDepth(b.path) || comparePath(a.path, b.path));

  // Outermost directory artifacts only — nested removals are covered by recursive delete.
  const dirsToDelete: DesiredArtifact[] = [];
  for (const dirArtifact of removedDirs) {
    if (dirsToDelete.some((ancestor) => isPathUnder(dirArtifact.path, ancestor.path))) {
      continue;
    }
    dirsToDelete.push(dirArtifact);
  }

  const filesToDelete = removed
    .filter((a) => a.kind === "file")
    .filter((fileArtifact) => !dirsToDelete.some((d) => isPathUnder(fileArtifact.path, d.path)))
    .slice()
    .sort((a, b) => comparePath(a.path, b.path));

  for (const fileArtifact of filesToDelete) {
    const abs = join(materializationRoot, fileArtifact.path);
    if (!existsSync(abs)) {
      continue;
    }
    const stat = lstatSync(abs);
    if (!stat.isDirectory()) {
      ops.push({
        type: "delete",
        path: fileArtifact.path,
        kind: "file",
        instanceId: fileArtifact.instanceId,
        artifactKey: fileArtifact.artifactKey,
      });
    }
  }

  for (const dirArtifact of dirsToDelete) {
    const abs = join(materializationRoot, dirArtifact.path);
    if (!existsSync(abs)) {
      continue;
    }
    ops.push({
      type: "delete",
      path: dirArtifact.path,
      kind: "directory",
      instanceId: dirArtifact.instanceId,
      artifactKey: dirArtifact.artifactKey,
    });
  }
}
