import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { FileMode } from "../architecture/artifacts";
import type {
  DesiredArtifact,
  DesiredInventory,
  Diagnostic,
} from "../inventory/derive-desired-inventory";
import { artifactIdentity, type Manifest } from "./manifest";

export type PlanOp =
  | {
      readonly type: "mkdir";
      readonly path: string;
      readonly instanceId: string;
      readonly artifactKey: string;
    }
  | {
      readonly type: "write";
      readonly path: string;
      readonly content: string;
      readonly instanceId: string;
      readonly artifactKey: string;
      readonly mode: FileMode;
    };

export type PlanResult =
  | { readonly ok: true; readonly ops: readonly PlanOp[] }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

export function planApply(input: {
  inventory: DesiredInventory;
  contents: ReadonlyMap<string, string>;
  lastManifest: Manifest | undefined;
  materializationRoot: string;
}): PlanResult {
  const diagnostics: Diagnostic[] = [];
  const ops: PlanOp[] = [];
  const previousById = indexManifestArtifacts(input.lastManifest);

  const directories = input.inventory.artifacts
    .filter((a) => a.kind === "directory")
    .slice()
    .sort((a, b) => pathDepth(a.path) - pathDepth(b.path) || comparePath(a.path, b.path));

  const files = input.inventory.artifacts
    .filter((a) => a.kind === "file")
    .slice()
    .sort((a, b) => comparePath(a.path, b.path));

  for (const artifact of directories) {
    planDirectory(artifact, input.materializationRoot, ops, diagnostics);
  }

  for (const artifact of files) {
    planFile(artifact, input, previousById, ops, diagnostics);
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }
  return { ok: true, ops };
}

function planDirectory(
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

function planFile(
  artifact: DesiredArtifact,
  input: {
    contents: ReadonlyMap<string, string>;
    materializationRoot: string;
  },
  previousById: ReadonlyMap<string, DesiredArtifact>,
  ops: PlanOp[],
  diagnostics: Diagnostic[]
): void {
  const identity = artifactIdentity(artifact);
  const content = input.contents.get(identity) ?? "";
  const mode = artifact.mode ?? "scaffold";
  const abs = join(input.materializationRoot, artifact.path);
  const previous = previousById.get(identity);
  const managedAtSamePath = previous !== undefined && previous.path === artifact.path;

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

  if (!managedAtSamePath) {
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

function indexManifestArtifacts(manifest: Manifest | undefined): Map<string, DesiredArtifact> {
  const map = new Map<string, DesiredArtifact>();
  if (!manifest) {
    return map;
  }
  for (const artifact of manifest.artifacts) {
    map.set(artifactIdentity(artifact), artifact);
  }
  return map;
}

function pathDepth(path: string): number {
  if (path === "" || path === ".") {
    return 0;
  }
  return path.split("/").length;
}

function comparePath(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
