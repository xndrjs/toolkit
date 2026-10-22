import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import type { DesiredInventory } from "../inventory/derive-desired-inventory";

export const MANIFEST_VERSION = 1 as const;
export const MANIFEST_RELATIVE_PATH = join(".struttura", "manifest.json");

export type ManifestArtifact = DesiredInventory["artifacts"][number];
export type ManifestInstance = DesiredInventory["instances"][number];

/**
 * Last fully successful apply (ADR 0006). Paths on artifacts are relative to the
 * materialization root; `materializationRoot` is relative to the structure dir.
 */
export type Manifest = {
  readonly version: typeof MANIFEST_VERSION;
  readonly structureName: string;
  /** Materialization root path relative to the structure directory. */
  readonly materializationRoot: string;
  readonly instances: readonly ManifestInstance[];
  readonly artifacts: readonly ManifestArtifact[];
};

export function manifestPath(structureDir: string): string {
  return join(structureDir, MANIFEST_RELATIVE_PATH);
}

export function readManifest(structureDir: string): Manifest | undefined {
  const path = manifestPath(structureDir);
  if (!existsSync(path)) {
    return undefined;
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as Manifest;
  if (raw.version !== MANIFEST_VERSION) {
    throw new Error(`Unsupported struttura manifest version: ${String(raw.version)}`);
  }
  return raw;
}

export function writeManifest(structureDir: string, manifest: Manifest): void {
  const path = manifestPath(structureDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export function buildManifest(
  inventory: DesiredInventory,
  structureDir: string,
  materializationRoot: string
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
  };
}

export function manifestsEqual(a: Manifest, b: Manifest): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function artifactIdentity(artifact: { instanceId: string; artifactKey: string }): string {
  return `${artifact.instanceId}::${artifact.artifactKey}`;
}
