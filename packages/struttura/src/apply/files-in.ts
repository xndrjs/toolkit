import { root, type DirRef } from "../structure/artifacts";
import type { DesiredArtifact, DesiredInventory } from "../inventory/derive-desired-inventory";

export type ArtifactIdentity = {
  readonly instanceId: string;
  readonly artifactKey: string;
};

/**
 * Options for inventory listing at Sync render (ADR 0014).
 * - default: files whose directory reference is exactly `dirRef`
 * - `recursive: true`: files whose path is under the directory tree
 * - `includeSelf` false (default): omit the file currently being rendered
 * - `exclude`: drop files whose path relative to the DirRef matches
 */
export type FilesInOptions = {
  readonly includeSelf?: boolean;
  readonly recursive?: boolean;
  readonly exclude?: string | RegExp;
};

/**
 * Managed file artifacts under a DirRef from the Desired inventory.
 */
export function filesIn(
  inventory: DesiredInventory,
  dirRef: DirRef,
  self: ArtifactIdentity,
  options?: FilesInOptions
): readonly DesiredArtifact[] {
  const includeSelf = options?.includeSelf ?? false;
  const recursive = options?.recursive ?? false;
  const exclude = options?.exclude;

  const matched = inventory.artifacts.filter((artifact) => {
    if (artifact.kind !== "file") {
      return false;
    }
    if (!matchesDirectory(artifact, dirRef, recursive)) {
      return false;
    }
    if (!includeSelf && isSelf(artifact, self)) {
      return false;
    }
    if (exclude !== undefined && matchesExclude(relativePath(artifact.path, dirRef), exclude)) {
      return false;
    }
    return true;
  });

  return matched.slice().sort(compareArtifactPath);
}

/**
 * DirRef for the directory that owns a managed file artifact.
 */
export function directoryRefForFile(
  fileArtifact: DesiredArtifact,
  inventory: DesiredInventory
): DirRef {
  const directory = fileArtifact.directory;

  if (directory.kind === "root") {
    return root;
  }

  if (directory.kind === "artifact") {
    const dirArtifact = inventory.artifacts.find(
      (artifact) =>
        artifact.kind === "directory" &&
        artifact.instanceId === directory.instanceId &&
        artifact.artifactKey === directory.artifactKey
    );
    if (!dirArtifact) {
      throw new Error(
        `Missing directory artifact ${directory.instanceId}/${directory.artifactKey} for file "${fileArtifact.path}"`
      );
    }
    return {
      kind: "directory",
      path: dirArtifact.path,
      instanceId: directory.instanceId,
      artifactKey: directory.artifactKey,
    };
  }

  throw new Error(
    `File "${fileArtifact.path}" sits on an inline directory path; Sync listing requires a DirRef identity (owned directory artifact or root)`
  );
}

function matchesDirectory(artifact: DesiredArtifact, dirRef: DirRef, recursive: boolean): boolean {
  if (!recursive) {
    return referencesDirectory(artifact, dirRef);
  }
  return isPathUnderDirectory(artifact.path, dirRef);
}

function referencesDirectory(artifact: DesiredArtifact, dirRef: DirRef): boolean {
  if (dirRef.kind === "root") {
    return artifact.directory.kind === "root";
  }
  return (
    artifact.directory.kind === "artifact" &&
    artifact.directory.instanceId === dirRef.instanceId &&
    artifact.directory.artifactKey === dirRef.artifactKey
  );
}

function isPathUnderDirectory(filePath: string, dirRef: DirRef): boolean {
  if (dirRef.kind === "root") {
    return true;
  }
  if (filePath === dirRef.path) {
    return false;
  }
  const prefix = dirRef.path === "" ? "" : `${dirRef.path}/`;
  return prefix === "" ? true : filePath.startsWith(prefix);
}

function relativePath(filePath: string, dirRef: DirRef): string {
  if (dirRef.kind === "root" || dirRef.path === "") {
    return filePath;
  }
  const prefix = `${dirRef.path}/`;
  if (filePath.startsWith(prefix)) {
    return filePath.slice(prefix.length);
  }
  return filePath;
}

function matchesExclude(relative: string, exclude: string | RegExp): boolean {
  if (typeof exclude === "string") {
    return relative === exclude;
  }
  return exclude.test(relative);
}

function isSelf(artifact: DesiredArtifact, self: ArtifactIdentity): boolean {
  return artifact.instanceId === self.instanceId && artifact.artifactKey === self.artifactKey;
}

function compareArtifactPath(a: DesiredArtifact, b: DesiredArtifact): number {
  if (a.path < b.path) {
    return -1;
  }
  if (a.path > b.path) {
    return 1;
  }
  return 0;
}
