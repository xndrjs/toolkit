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
 * instance, and `filesIn(dirRef, includeSelf?)` for sync barrels.
 *
 * Queries affect content only — never presence or paths.
 */
export type InventoryQuery = {
  instances(construct: ConstructDefinition | string): readonly QueriedInstance[];
  artifacts(instance: { readonly id: string } | string): readonly DesiredArtifact[];
  /**
   * Managed file artifacts whose directory reference is `dirRef`.
   * When `includeSelf` is false (default), omits the file currently being rendered.
   */
  filesIn(dirRef: DirRef, includeSelf?: boolean): readonly DesiredArtifact[];
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

    filesIn(dirRef, includeSelf = false) {
      const matched = inventory.artifacts.filter(
        (artifact) =>
          artifact.kind === "file" &&
          referencesDirectory(artifact, dirRef) &&
          (includeSelf || !isSelf(artifact, self))
      );
      return matched.slice().sort(compareArtifactPath);
    },
  };
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
