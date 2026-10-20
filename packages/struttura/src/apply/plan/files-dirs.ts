import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { DesiredArtifact, Diagnostic } from "../../inventory/derive-desired-inventory";
import { artifactIdentity } from "../manifest";
import type { PlanOp, PlannedMove } from "./types";

export function planDirectory(
  artifact: DesiredArtifact,
  materializationRoot: string,
  ops: PlanOp[],
  diagnostics: Diagnostic[]
): void {
  const abs = join(materializationRoot, artifact.path);
  if (!existsSync(abs)) {
    ops.push({
      type: "mkdir",
      path: artifact.path,
      instanceId: artifact.instanceId,
      artifactKey: artifact.artifactKey,
    });
    return;
  }

  const stat = lstatSync(abs);
  if (!stat.isDirectory()) {
    diagnostics.push({
      code: "path-collision",
      message: `Cannot create directory artifact at "${artifact.path}": path exists and is not a directory`,
      instanceId: artifact.instanceId,
      constructName: artifact.constructName,
      artifactKey: artifact.artifactKey,
      path: artifact.path,
    });
  }
  // Preexisting directory is adopted (ADR 0008).
}

export function planFile(
  artifact: DesiredArtifact,
  input: {
    contents: ReadonlyMap<string, string>;
    materializationRoot: string;
  },
  previousById: ReadonlyMap<string, DesiredArtifact>,
  movedIdentities: ReadonlySet<string>,
  coveredIdentities: ReadonlySet<string>,
  moves: readonly PlannedMove[],
  ops: PlanOp[],
  diagnostics: Diagnostic[]
): void {
  const identity = artifactIdentity(artifact);
  const content = input.contents.get(identity) ?? "";
  const mode = artifact.mode ?? "scaffold";
  const abs = join(input.materializationRoot, artifact.path);
  const previous = previousById.get(identity);
  const relocated =
    movedIdentities.has(identity) ||
    coveredIdentities.has(identity) ||
    (previous !== undefined && previous.path === artifact.path);

  if (movedIdentities.has(identity) || coveredIdentities.has(identity)) {
    // After the move, scaffold keeps authored bytes; sync may still need a rewrite.
    if (mode === "scaffold") {
      return;
    }
    const sourcePath =
      contentSourcePath(identity, previous, moves, coveredIdentities, input.materializationRoot) ??
      (existsSync(abs) && !lstatSync(abs).isDirectory() ? artifact.path : undefined);
    if (sourcePath !== undefined) {
      const onDisk = readFileSync(join(input.materializationRoot, sourcePath), "utf8");
      if (onDisk !== content) {
        ops.push({
          type: "write",
          path: artifact.path,
          content,
          instanceId: artifact.instanceId,
          artifactKey: artifact.artifactKey,
          mode,
        });
      }
    }
    return;
  }

  if (!existsSync(abs)) {
    ops.push({
      type: "write",
      path: artifact.path,
      content,
      instanceId: artifact.instanceId,
      artifactKey: artifact.artifactKey,
      mode,
    });
    return;
  }

  const stat = lstatSync(abs);
  if (stat.isDirectory()) {
    diagnostics.push({
      code: "path-collision",
      message: `Cannot write file artifact at "${artifact.path}": path exists as a directory`,
      instanceId: artifact.instanceId,
      constructName: artifact.constructName,
      artifactKey: artifact.artifactKey,
      path: artifact.path,
    });
    return;
  }

  if (!relocated) {
    diagnostics.push({
      code: "path-collision",
      message: `Refusing to overwrite unmanaged file at "${artifact.path}"`,
      instanceId: artifact.instanceId,
      constructName: artifact.constructName,
      artifactKey: artifact.artifactKey,
      path: artifact.path,
    });
    return;
  }

  if (mode === "scaffold") {
    // Preserve authored content while the artifact remains declared.
    return;
  }

  const onDisk = readFileSync(abs, "utf8");
  if (onDisk !== content) {
    ops.push({
      type: "write",
      path: artifact.path,
      content,
      instanceId: artifact.instanceId,
      artifactKey: artifact.artifactKey,
      mode,
    });
  }
}

function contentSourcePath(
  identity: string,
  previous: DesiredArtifact | undefined,
  moves: readonly PlannedMove[],
  coveredIdentities: ReadonlySet<string>,
  materializationRoot: string
): string | undefined {
  const direct = moves.find((m) => m.identity === identity);
  if (direct !== undefined) {
    const abs = join(materializationRoot, direct.from);
    if (existsSync(abs) && !lstatSync(abs).isDirectory()) {
      return direct.from;
    }
  }

  if (previous !== undefined) {
    const abs = join(materializationRoot, previous.path);
    if (existsSync(abs) && !lstatSync(abs).isDirectory()) {
      return previous.path;
    }
  }

  if (coveredIdentities.has(identity) && previous !== undefined) {
    const abs = join(materializationRoot, previous.path);
    if (existsSync(abs) && !lstatSync(abs).isDirectory()) {
      return previous.path;
    }
  }

  return undefined;
}
