import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import type { DesiredInventory } from "../inventory/derive-desired-inventory";

export const MANIFEST_VERSION = 1 as const;
export const MANIFEST_RELATIVE_PATH = join(".struttura", "manifest.json");

export type ManifestArtifact = DesiredInventory["artifacts"][number];
export type ManifestInstance = DesiredInventory["instances"][number];

/**
 * Last fully successful apply (ADR 0006 / 0015). Paths on artifacts are relative
 * to the materialization root; `materializationRoot` is relative to the structure dir.
 * `zombies` retains previously managed artifacts until an explicit prune.
 */
export type Manifest = {
  readonly version: typeof MANIFEST_VERSION;
  readonly structureName: string;
  /** Materialization root path relative to the structure directory. */
  readonly materializationRoot: string;
  readonly instances: readonly ManifestInstance[];
  readonly artifacts: readonly ManifestArtifact[];
  /** Managed artifacts no longer in Desired inventory (ADR 0015). */
  readonly zombies: readonly ManifestArtifact[];
};

export function manifestPath(structureDir: string): string {
  return join(structureDir, MANIFEST_RELATIVE_PATH);
}

export function readManifest(structureDir: string): Manifest | undefined {
  const path = manifestPath(structureDir);
  if (!existsSync(path)) {
    return undefined;
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as Manifest & {
    zombies?: readonly ManifestArtifact[];
  };
  if (raw.version !== MANIFEST_VERSION) {
    throw new Error(`Unsupported struttura manifest version: ${String(raw.version)}`);
  }
  return {
    ...raw,
    zombies: raw.zombies ?? [],
  };
}

export function writeManifest(structureDir: string, manifest: Manifest): void {
  const path = manifestPath(structureDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export function buildManifest(
  inventory: DesiredInventory,
  structureDir: string,
  materializationRoot: string,
  options: { readonly zombies?: readonly ManifestArtifact[] } = {}
): Manifest {
  const structureAbs = resolve(structureDir);
  const materializationAbs = resolve(materializationRoot);
  let materializationRelative = relative(structureAbs, materializationAbs);
  if (materializationRelative === "") {
    materializationRelative = ".";
  }
  return {
    version: MANIFEST_VERSION,
    structureName: inventory.structureName,
    materializationRoot: materializationRelative.split("\\").join("/"),
    instances: inventory.instances,
    artifacts: inventory.artifacts,
    zombies: options.zombies ?? [],
  };
}

export function manifestsEqual(a: Manifest, b: Manifest): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function artifactIdentity(artifact: { instanceId: string; artifactKey: string }): string {
  return `${artifact.instanceId}::${artifact.artifactKey}`;
}

/** Desired artifacts plus zombies (identity index for moves / deletions). */
export function trackedManifestArtifacts(
  manifest: Manifest | undefined
): readonly ManifestArtifact[] {
  if (!manifest) {
    return [];
  }
  return [...manifest.artifacts, ...manifest.zombies];
}

/**
 * Previously tracked artifacts absent from the desired inventory (ADR 0015).
 * Reclaimed identities (back in Desired) leave the zombie set.
 */
export function computeZombies(
  inventory: DesiredInventory,
  lastManifest: Manifest | undefined
): ManifestArtifact[] {
  if (!lastManifest) {
    return [];
  }
  const desiredIds = new Set(inventory.artifacts.map((a) => artifactIdentity(a)));
  const byId = new Map<string, ManifestArtifact>();
  for (const artifact of trackedManifestArtifacts(lastManifest)) {
    const id = artifactIdentity(artifact);
    if (!desiredIds.has(id)) {
      byId.set(id, artifact);
    }
  }
  return [...byId.values()].sort((a, b) => {
    if (a.path !== b.path) {
      return a.path < b.path ? -1 : 1;
    }
    const idA = artifactIdentity(a);
    const idB = artifactIdentity(b);
    return idA < idB ? -1 : idA > idB ? 1 : 0;
  });
}

/** Drop zombies whose identity or path was removed by executed delete ops. */
export function zombiesAfterDeletes(
  zombies: readonly ManifestArtifact[],
  deletedOps: readonly {
    readonly type: string;
    readonly path?: string;
    readonly kind?: string;
    readonly instanceId?: string;
    readonly artifactKey?: string;
  }[]
): ManifestArtifact[] {
  const deletedIds = new Set<string>();
  const deletedDirs: string[] = [];
  for (const op of deletedOps) {
    if (op.type !== "delete" || op.path === undefined) {
      continue;
    }
    if (op.instanceId !== undefined && op.artifactKey !== undefined) {
      deletedIds.add(artifactIdentity({ instanceId: op.instanceId, artifactKey: op.artifactKey }));
    }
    if (op.kind === "directory") {
      deletedDirs.push(op.path);
    }
  }
  return zombies.filter((zombie) => {
    if (deletedIds.has(artifactIdentity(zombie))) {
      return false;
    }
    return !deletedDirs.some((dir) => zombie.path === dir || isPathUnder(zombie.path, dir));
  });
}

function isPathUnder(path: string, parent: string): boolean {
  if (parent === "" || parent === ".") {
    return path !== "" && path !== ".";
  }
  return path === parent || path.startsWith(`${parent}/`);
}
