import { resolve } from "node:path";

import {
  readManifest,
  writeManifest,
  type Manifest,
  type ManifestArtifact,
  type ManifestInstance,
} from "../apply/manifest";

export type MigrateIdOptions = {
  /** Directory that owns `.struttura/manifest.json`. */
  readonly structureDir: string;
  /** Effective instance id currently recorded in the manifest. */
  readonly from: string;
  /** Replacement effective instance id. */
  readonly to: string;
};

export type MigrateIdDiagnosticCode =
  | "missing-manifest"
  | "unknown-old-id"
  | "id-collision"
  | "same-id";

export type MigrateIdDiagnostic = {
  readonly code: MigrateIdDiagnosticCode;
  readonly message: string;
};

export type MigrateIdSuccess = {
  readonly ok: true;
  readonly manifest: Manifest;
  /** False when `from === to` and the manifest already matches. */
  readonly mutated: boolean;
};

export type MigrateIdFailure = {
  readonly ok: false;
  readonly diagnostics: readonly MigrateIdDiagnostic[];
};

export type MigrateIdResult = MigrateIdSuccess | MigrateIdFailure;

/**
 * Rewrite an instance effective id and every reference to it in the last-successful
 * manifest (analysis §13 / ADR 0011). Does not rewrite population TypeScript.
 */
export function migrateId(options: MigrateIdOptions): MigrateIdResult {
  const structureDir = resolve(options.structureDir);
  const from = options.from;
  const to = options.to;

  if (from === to) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "same-id",
          message: `migrate-id requires distinct ids; got from="${from}" to="${to}".`,
        },
      ],
    };
  }

  const last = readManifest(structureDir);
  if (last === undefined) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "missing-manifest",
          message: `No success manifest found under ${structureDir}/.struttura/.`,
        },
      ],
    };
  }

  const hasOld = last.instances.some((instance) => instance.id === from);
  if (!hasOld) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "unknown-old-id",
          message: `Manifest has no instance with id "${from}".`,
        },
      ],
    };
  }

  if (last.instances.some((instance) => instance.id === to)) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "id-collision",
          message: `Cannot migrate "${from}" → "${to}": id "${to}" already exists in the manifest.`,
        },
      ],
    };
  }

  const next = rewriteManifestIds(last, from, to);
  writeManifest(structureDir, next);
  return { ok: true, manifest: next, mutated: true };
}

/**
 * Structured rewrite of instance ids and dependency/directory references.
 * Avoids indiscriminate JSON text substitution (analysis §13).
 */
export function rewriteManifestIds(manifest: Manifest, from: string, to: string): Manifest {
  return {
    ...manifest,
    instances: manifest.instances.map((instance) => rewriteInstance(instance, from, to)),
    artifacts: manifest.artifacts.map((artifact) => rewriteArtifact(artifact, from, to)),
  };
}

function rewriteInstance(instance: ManifestInstance, from: string, to: string): ManifestInstance {
  const dependencies: Record<string, string> = {};
  for (const [key, depId] of Object.entries(instance.dependencies)) {
    dependencies[key] = depId === from ? to : depId;
  }
  return {
    ...instance,
    id: instance.id === from ? to : instance.id,
    dependencies,
  };
}

function rewriteArtifact(artifact: ManifestArtifact, from: string, to: string): ManifestArtifact {
  const instanceId = artifact.instanceId === from ? to : artifact.instanceId;
  if (artifact.directory.kind !== "artifact") {
    return instanceId === artifact.instanceId ? artifact : { ...artifact, instanceId };
  }
  const directoryInstanceId =
    artifact.directory.instanceId === from ? to : artifact.directory.instanceId;
  if (instanceId === artifact.instanceId && directoryInstanceId === artifact.directory.instanceId) {
    return artifact;
  }
  return {
    ...artifact,
    instanceId,
    directory: {
      kind: "artifact",
      instanceId: directoryInstanceId,
      artifactKey: artifact.directory.artifactKey,
    },
  };
}
