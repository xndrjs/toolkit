import type { DesiredArtifact } from "../../inventory/derive-desired-inventory";
import { artifactIdentity, type Manifest } from "../manifest";

/** True when `path` is `parent` or a descendant of `parent` (posix-relative segments). */
export function isPathUnder(path: string, parent: string): boolean {
  if (parent === "" || parent === ".") {
    return path !== "" && path !== ".";
  }
  return path === parent || path.startsWith(`${parent}/`);
}

export function relativeUnder(path: string, parent: string): string {
  if (path === parent) {
    return "";
  }
  if (parent === "" || parent === ".") {
    return path;
  }
  if (path.startsWith(`${parent}/`)) {
    return path.slice(parent.length + 1);
  }
  return path;
}

export function pathDepth(path: string): number {
  if (path === "" || path === ".") {
    return 0;
  }
  return path.split("/").length;
}

export function comparePath(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function indexManifestArtifacts(
  manifest: Manifest | undefined
): Map<string, DesiredArtifact> {
  const map = new Map<string, DesiredArtifact>();
  if (!manifest) {
    return map;
  }
  // Desired first, then zombies (zombies fill gaps; desired wins on collision).
  for (const artifact of manifest.zombies) {
    map.set(artifactIdentity(artifact), artifact);
  }
  for (const artifact of manifest.artifacts) {
    map.set(artifactIdentity(artifact), artifact);
  }
  return map;
}
