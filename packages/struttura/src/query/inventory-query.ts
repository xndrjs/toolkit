import type { ConstructDefinition } from "../architecture/define-architecture";
import type { DirRef } from "../architecture/artifacts";
import type { DesiredArtifact, DesiredInventory } from "../inventory/derive-desired-inventory";

export type QueriedInstance = DesiredInventory["instances"][number];

export type ArtifactIdentity = {
  readonly instanceId: string;
  readonly artifactKey: string;
};

/**
 * Wave 1 query surface (ADR 0004): instances of a construct, artifacts of an
 * instance, and `filesIn(dirRef, options?)` for sync barrels.
 *
 * Queries affect content only — never presence or paths.
 */
export type FilesInOptions = {
  /** When false (default), omits the file currently being rendered. */
  readonly includeSelf?: boolean;
  /**
   * When true, include managed files whose path is under the directory (nested
   * folders). Default false: only files whose directory ref is exactly `dirRef`.
   */
  readonly recursive?: boolean;
};

export type InventoryQuery = {
  instances(construct: ConstructDefinition | string): readonly QueriedInstance[];
  artifacts(instance: { readonly id: string } | string): readonly DesiredArtifact[];
  /**
   * Managed file artifacts for a directory.
   * - default: files whose directory reference is exactly `dirRef`
   * - `recursive: true`: files whose path is under the directory tree
   * When `includeSelf` is false (default), omits the file currently being rendered.
   */
  filesIn(dirRef: DirRef, options?: FilesInOptions): readonly DesiredArtifact[];
};

export function createInventoryQuery(
  inventory: DesiredInventory,
  self?: ArtifactIdentity
): InventoryQuery {
  return {
    instances(construct) {
      const constructName = typeof construct === "string" ? construct : construct.name;
      return inventory.instances.filter((instance) => instance.constructName === constructName);
    },

    artifacts(instance) {
      const instanceId = typeof instance === "string" ? instance : instance.id;
      return inventory.artifacts.filter((artifact) => artifact.instanceId === instanceId);
    },

    filesIn(dirRef, options) {
      const includeSelf = options?.includeSelf ?? false;
      const recursive = options?.recursive ?? false;
      const matched = inventory.artifacts.filter(
        (artifact) =>
          artifact.kind === "file" &&
          matchesDirectory(artifact, dirRef, recursive) &&
          (includeSelf || !isSelf(artifact, self))
      );
      return matched.slice().sort(compareArtifactPath);
    },
  };
}

function matchesDirectory(artifact: DesiredArtifact, dirRef: DirRef, recursive: boolean): boolean {
  if (!recursive) {
    return referencesDirectory(artifact, dirRef);
  }
  return isPathUnderDirectory(artifact.path, dirRef);
}

function isPathUnderDirectory(filePath: string, dirRef: DirRef): boolean {
  if (dirRef.kind === "root") {
    return true;
  }
  if (filePath === dirRef.path) {
    return false;
  }
  const prefix = dirRef.path === "" ? "" : `${dirRef.path}/`;
  return prefix === "" ? !filePath.includes("..") : filePath.startsWith(prefix);
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

function isSelf(artifact: DesiredArtifact, self: ArtifactIdentity | undefined): boolean {
  if (!self) {
    return false;
  }
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
