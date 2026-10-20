import { resolve } from "node:path";

import type { FileMode } from "../architecture/artifacts";
import type { Population } from "../population/create-population";
import {
  deriveDesiredInventory,
  type DesiredArtifact,
  type DesiredInventory,
  type Diagnostic,
} from "../inventory/derive-desired-inventory";
import { buildManifest, manifestsEqual, readManifest, type Manifest } from "../apply/manifest";
import { planApply, type PlanOp } from "../apply/plan";
import { renderFileContents } from "../apply/render-contents";

export type InspectOptions = {
  /** Absolute or cwd-relative path confined for artifact planning (ADR 0005). */
  readonly materializationRoot: string;
  /**
   * Directory that owns support files. Last-successful manifest is read from
   * `{architectureDir}/.struttura/manifest.json` — never written by inspect.
   */
  readonly architectureDir: string;
  /**
   * Repository root, distinct from the materialization root (analysis §16).
   * Defaults to the parent of `architectureDir` (conventional layout).
   */
  readonly repositoryRoot?: string;
};

export type InspectArtifactView = {
  readonly instanceId: string;
  readonly constructName: string;
  readonly artifactKey: string;
  readonly kind: "file" | "directory";
  readonly path: string;
  readonly mode?: FileMode;
  /** Directory placement for file artifacts; provenance stays on this view. */
  readonly directory: DesiredArtifact["directory"];
  /**
   * When `directory` references a managed directory artifact, the producing
   * construct/instance/path of that directory (analysis §16).
   */
  readonly referencedDirectory?: {
    readonly instanceId: string;
    readonly constructName: string;
    readonly artifactKey: string;
    readonly path: string;
  };
};

export type InspectReport = {
  readonly roots: {
    readonly repository: string;
    readonly materialization: string;
    readonly architecture: string;
  };
  readonly inventory: DesiredInventory;
  readonly instances: DesiredInventory["instances"];
  /** Derived artifact paths (files and directories), sorted. */
  readonly tree: readonly string[];
  readonly artifacts: readonly InspectArtifactView[];
  readonly scaffold: readonly InspectArtifactView[];
  readonly sync: readonly InspectArtifactView[];
  readonly plan: readonly PlanOp[];
  readonly lastManifest: Manifest | undefined;
  /** True when apply would write files or directories under the materialization root. */
  readonly wouldMutateDisk: boolean;
  /** True when apply would rewrite the success manifest. */
  readonly wouldUpdateManifest: boolean;
};

export type InspectSuccess = {
  readonly ok: true;
  readonly report: InspectReport;
};

export type InspectFailure = {
  readonly ok: false;
  readonly diagnostics: readonly Diagnostic[];
};

export type InspectResult = InspectSuccess | InspectFailure;

/**
 * Read-only report of population vs disk/manifest (analysis §16).
 * Never mutates the materialization root or the success manifest.
 */
export function inspect(population: Population, options: InspectOptions): InspectResult {
  const materializationRoot = resolve(options.materializationRoot);
  const architectureDir = resolve(options.architectureDir);
  const repositoryRoot = resolve(options.repositoryRoot ?? resolve(architectureDir, ".."));

  const derived = deriveDesiredInventory(population);
  if (!derived.ok) {
    return { ok: false, diagnostics: derived.diagnostics };
  }

  const contents = renderFileContents(population, derived.inventory);
  const lastManifest = readManifest(architectureDir);
  const planned = planApply({
    inventory: derived.inventory,
    contents,
    lastManifest,
    materializationRoot,
  });
  if (!planned.ok) {
    return { ok: false, diagnostics: planned.diagnostics };
  }

  const nextManifest = buildManifest(derived.inventory, architectureDir, materializationRoot);
  const wouldUpdateManifest =
    lastManifest === undefined || !manifestsEqual(lastManifest, nextManifest);

  const artifacts = viewArtifacts(derived.inventory);
  const scaffold = artifacts.filter((a) => a.kind === "file" && a.mode === "scaffold");
  const sync = artifacts.filter((a) => a.kind === "file" && a.mode === "sync");

  return {
    ok: true,
    report: {
      roots: {
        repository: repositoryRoot,
        materialization: materializationRoot,
        architecture: architectureDir,
      },
      inventory: derived.inventory,
      instances: derived.inventory.instances,
      tree: derived.inventory.artifacts
        .map((a) => a.path)
        .slice()
        .sort(comparePath),
      artifacts,
      scaffold,
      sync,
      plan: planned.ops,
      lastManifest,
      wouldMutateDisk: planned.ops.length > 0,
      wouldUpdateManifest,
    },
  };
}

function viewArtifacts(inventory: DesiredInventory): readonly InspectArtifactView[] {
  const byIdentity = new Map<string, DesiredArtifact>();
  for (const artifact of inventory.artifacts) {
    byIdentity.set(`${artifact.instanceId}::${artifact.artifactKey}`, artifact);
  }

  return inventory.artifacts.map((artifact) => {
    const view: InspectArtifactView = {
      instanceId: artifact.instanceId,
      constructName: artifact.constructName,
      artifactKey: artifact.artifactKey,
      kind: artifact.kind,
      path: artifact.path,
      mode: artifact.mode,
      directory: artifact.directory,
      referencedDirectory: resolveReferencedDirectory(artifact, byIdentity),
    };
    return view;
  });
}

function resolveReferencedDirectory(
  artifact: DesiredArtifact,
  byIdentity: ReadonlyMap<string, DesiredArtifact>
): InspectArtifactView["referencedDirectory"] {
  if (artifact.kind !== "file" || artifact.directory.kind !== "artifact") {
    return undefined;
  }
  const key = `${artifact.directory.instanceId}::${artifact.directory.artifactKey}`;
  const dir = byIdentity.get(key);
  if (!dir) {
    return undefined;
  }
  return {
    instanceId: dir.instanceId,
    constructName: dir.constructName,
    artifactKey: dir.artifactKey,
    path: dir.path,
  };
}

function comparePath(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
