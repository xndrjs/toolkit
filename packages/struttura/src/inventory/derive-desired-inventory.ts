import {
  type ArtifactDirRef,
  type DirDescriptor,
  type DirRef,
  type FileDescriptor,
  type FileMode,
  type FileRef,
  PathEscapeError,
  isRootPath,
  isValidFilename,
  joinPath,
  normalizeRelativePath,
} from "../architecture/artifacts";
import {
  FileRefAsDirectoryError,
  InvalidAuthoringKeyError,
  InvalidPlacementRootError,
  ReservedKeyCollisionError,
  flattenPlacement,
  sealNavigableInstance,
} from "../architecture/tree";
import type { Population, RegisteredInstance } from "../population/create-population";

export type DiagnosticCode =
  | "duplicate-effective-id"
  | "invalid-filename"
  | "directory-path-collision"
  | "path-collision"
  | "root-owned"
  | "path-escape"
  | "missing-directory-ref"
  | "file-ref-as-directory"
  | "incompatible-paths"
  | "artifact-callback-error"
  | "unknown-dependency-cycle"
  | "stale-generated-api"
  | "reserved-key-collision"
  | "invalid-authoring-key"
  | "invalid-placement-root";

export type Diagnostic = {
  readonly code: DiagnosticCode;
  readonly message: string;
  readonly instanceId?: string;
  readonly constructName?: string;
  readonly artifactKey?: string;
  readonly path?: string;
};

export type DesiredArtifact = {
  readonly instanceId: string;
  readonly constructName: string;
  readonly artifactKey: string;
  readonly kind: "file" | "directory";
  readonly path: string;
  readonly mode?: FileMode;
  readonly filename?: string;
  readonly directory:
    | { readonly kind: "root" }
    | { readonly kind: "artifact"; readonly instanceId: string; readonly artifactKey: string }
    | { readonly kind: "inline"; readonly path: string };
};

export type DesiredInventory = {
  readonly architectureName: string;
  readonly instances: readonly {
    readonly id: string;
    readonly name: string;
    readonly constructName: string;
    readonly dependencies: Readonly<Record<string, string>>;
  }[];
  readonly artifacts: readonly DesiredArtifact[];
};

export type DeriveResult =
  | { readonly ok: true; readonly inventory: DesiredInventory }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

export function deriveDesiredInventory(population: Population): DeriveResult {
  const diagnostics: Diagnostic[] = [];
  const instances = population.instances;

  collectDuplicateIds(instances, diagnostics);

  const ordered = topologicalOrder(instances, diagnostics);
  if (diagnostics.some((d) => d.code === "unknown-dependency-cycle")) {
    return { ok: false, diagnostics };
  }

  const desiredArtifacts: DesiredArtifact[] = [];

  for (const instance of ordered) {
    instance.artifacts = {};
    let descriptors: Record<string, DirDescriptor | FileDescriptor>;
    let treeDestination: DirRef | undefined;
    try {
      const ctx: Record<string, unknown> = {
        name: instance.name,
        id: instance.id,
        ...instance.dependencies,
      };
      if (instance.construct.authoring === "tree" && instance.construct.buildTree) {
        const placement = instance.construct.buildTree(
          ctx as Parameters<NonNullable<typeof instance.construct.buildTree>>[0]
        );
        treeDestination = placement.destination;
        descriptors = flattenPlacement(placement, {
          constructName: instance.construct.name,
        }) as Record<string, DirDescriptor | FileDescriptor>;
      } else {
        descriptors = instance.construct.buildArtifacts(
          ctx as Parameters<typeof instance.construct.buildArtifacts>[0]
        );
      }
    } catch (error) {
      if (error instanceof PathEscapeError) {
        diagnostics.push({
          code: "path-escape",
          message: error.message,
          instanceId: instance.id,
          constructName: instance.construct.name,
          path: error.path,
        });
        continue;
      }
      if (error instanceof ReservedKeyCollisionError) {
        diagnostics.push({
          code: "reserved-key-collision",
          message: error.message,
          instanceId: instance.id,
          constructName: instance.construct.name,
          artifactKey: error.key,
        });
        continue;
      }
      if (error instanceof InvalidAuthoringKeyError) {
        diagnostics.push({
          code: "invalid-authoring-key",
          message: error.message,
          instanceId: instance.id,
          constructName: instance.construct.name,
          artifactKey: error.key,
        });
        continue;
      }
      if (error instanceof InvalidPlacementRootError) {
        diagnostics.push({
          code: "invalid-placement-root",
          message: error.message,
          instanceId: instance.id,
          constructName: instance.construct.name,
        });
        continue;
      }
      if (error instanceof FileRefAsDirectoryError) {
        diagnostics.push({
          code: "file-ref-as-directory",
          message: error.message,
          instanceId: instance.id,
          constructName: instance.construct.name,
          path: error.path,
        });
        continue;
      }
      diagnostics.push({
        code: "artifact-callback-error",
        message: error instanceof Error ? error.message : String(error),
        instanceId: instance.id,
        constructName: instance.construct.name,
      });
      continue;
    }

    // Bind directories first so same-callback file({ directory: dir(...) }) can resolve to
    // the sibling directory artifact identity (needed for filesIn / provenance).
    const entries = Object.entries(descriptors);
    for (const [artifactKey, descriptor] of entries) {
      if (descriptor.kind === "dir-descriptor") {
        bindDirectory(instance, artifactKey, descriptor, desiredArtifacts, diagnostics);
      }
    }
    for (const [artifactKey, descriptor] of entries) {
      if (descriptor.kind === "file-descriptor") {
        bindFile(instance, artifactKey, descriptor, desiredArtifacts, diagnostics);
      }
    }

    if (instance.construct.authoring === "tree" && treeDestination) {
      sealNavigableInstance(
        instance as unknown as Record<string, unknown>,
        instance.artifacts as Record<
          string,
          { readonly kind: string; readonly path: string } & Record<string, unknown>
        >,
        treeDestination
      );
    }
  }

  validatePathCompatibility(desiredArtifacts, diagnostics);

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }

  const sortedArtifacts = [...desiredArtifacts].sort((a, b) => {
    if (a.path !== b.path) {
      return a.path < b.path ? -1 : 1;
    }
    if (a.instanceId !== b.instanceId) {
      return a.instanceId < b.instanceId ? -1 : 1;
    }
    return a.artifactKey < b.artifactKey ? -1 : a.artifactKey > b.artifactKey ? 1 : 0;
  });

  return {
    ok: true,
    inventory: {
      architectureName: population.architecture.name,
      instances: instances.map((instance) => ({
        id: instance.id,
        name: instance.name,
        constructName: instance.construct.name,
        dependencies: Object.fromEntries(
          Object.entries(instance.dependencies).map(([key, dep]) => [key, dep.id])
        ),
      })),
      artifacts: sortedArtifacts,
    },
  };
}

function collectDuplicateIds(
  instances: readonly RegisteredInstance[],
  diagnostics: Diagnostic[]
): void {
  const seen = new Map<string, RegisteredInstance>();
  for (const instance of instances) {
    const prior = seen.get(instance.id);
    if (prior) {
      diagnostics.push({
        code: "duplicate-effective-id",
        message: `Effective id "${instance.id}" is used by more than one instance`,
        instanceId: instance.id,
        constructName: instance.construct.name,
      });
    } else {
      seen.set(instance.id, instance);
    }
  }
}

function topologicalOrder(
  instances: readonly RegisteredInstance[],
  diagnostics: Diagnostic[]
): RegisteredInstance[] {
  const byId = new Map(instances.map((instance) => [instance.id, instance]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: RegisteredInstance[] = [];

  function visit(instance: RegisteredInstance): void {
    if (visited.has(instance.id)) {
      return;
    }
    if (visiting.has(instance.id)) {
      diagnostics.push({
        code: "unknown-dependency-cycle",
        message: `Dependency cycle involving instance "${instance.id}"`,
        instanceId: instance.id,
        constructName: instance.construct.name,
      });
      return;
    }
    visiting.add(instance.id);
    for (const dep of Object.values(instance.dependencies)) {
      const depInstance = byId.get(dep.id);
      if (depInstance) {
        visit(depInstance);
      }
    }
    visiting.delete(instance.id);
    visited.add(instance.id);
    ordered.push(instance);
  }

  for (const instance of instances) {
    visit(instance);
  }
  return ordered;
}

function bindDirectory(
  instance: RegisteredInstance,
  artifactKey: string,
  descriptor: DirDescriptor,
  desiredArtifacts: DesiredArtifact[],
  diagnostics: Diagnostic[]
): void {
  let path: string;
  try {
    path = normalizeRelativePath(descriptor.path);
  } catch (error) {
    if (error instanceof PathEscapeError) {
      diagnostics.push({
        code: "path-escape",
        message: error.message,
        instanceId: instance.id,
        constructName: instance.construct.name,
        artifactKey,
        path: error.path,
      });
      return;
    }
    throw error;
  }

  if (isRootPath(path)) {
    diagnostics.push({
      code: "root-owned",
      message: `Construct "${instance.construct.name}" cannot claim the materialization root as a directory artifact`,
      instanceId: instance.id,
      constructName: instance.construct.name,
      artifactKey,
      path: path || ".",
    });
    return;
  }

  const ref: ArtifactDirRef = {
    kind: "directory",
    path,
    instanceId: instance.id,
    artifactKey,
  };
  instance.artifacts[artifactKey] = ref;
  desiredArtifacts.push({
    instanceId: instance.id,
    constructName: instance.construct.name,
    artifactKey,
    kind: "directory",
    path,
    directory: { kind: "inline", path },
  });
}

function bindFile(
  instance: RegisteredInstance,
  artifactKey: string,
  descriptor: FileDescriptor,
  desiredArtifacts: DesiredArtifact[],
  diagnostics: Diagnostic[]
): void {
  if (!isValidFilename(descriptor.filename)) {
    diagnostics.push({
      code: "invalid-filename",
      message: `Invalid filename "${descriptor.filename}"`,
      instanceId: instance.id,
      constructName: instance.construct.name,
      artifactKey,
    });
    return;
  }

  const directoryMeta = resolveDirectoryRef(
    descriptor.directoryRef,
    instance,
    artifactKey,
    desiredArtifacts,
    diagnostics
  );
  if (!directoryMeta) {
    return;
  }

  const path = joinPath(directoryMeta.path, descriptor.filename);
  const ref: FileRef = {
    kind: "file",
    path,
    instanceId: instance.id,
    artifactKey,
    mode: descriptor.mode,
    filename: descriptor.filename,
  };
  instance.artifacts[artifactKey] = ref;
  desiredArtifacts.push({
    instanceId: instance.id,
    constructName: instance.construct.name,
    artifactKey,
    kind: "file",
    path,
    mode: descriptor.mode,
    filename: descriptor.filename,
    directory: directoryMeta.directory,
  });
}

function resolveDirectoryRef(
  directoryRef: DirRef | DirDescriptor | FileRef,
  instance: RegisteredInstance,
  artifactKey: string,
  desiredArtifacts: readonly DesiredArtifact[],
  diagnostics: Diagnostic[]
):
  | {
      path: string;
      directory: DesiredArtifact["directory"];
    }
  | undefined {
  if (directoryRef.kind === "file") {
    diagnostics.push({
      code: "file-ref-as-directory",
      message: `File artifact ref cannot be used as a directory for "${artifactKey}"`,
      instanceId: instance.id,
      constructName: instance.construct.name,
      artifactKey,
      path: directoryRef.path,
    });
    return undefined;
  }

  if (directoryRef.kind === "root") {
    return { path: "", directory: { kind: "root" } };
  }

  if (directoryRef.kind === "directory") {
    return {
      path: directoryRef.path,
      directory: {
        kind: "artifact",
        instanceId: directoryRef.instanceId,
        artifactKey: directoryRef.artifactKey,
      },
    };
  }

  // DirDescriptor from the same callback — prefer a sibling directory artifact
  // at this path so provenance / filesIn share one DirRef identity.
  try {
    const path = normalizeRelativePath(directoryRef.path);
    if (isRootPath(path)) {
      diagnostics.push({
        code: "root-owned",
        message: `File "${artifactKey}" cannot target the materialization root via an owned directory artifact; use root`,
        instanceId: instance.id,
        constructName: instance.construct.name,
        artifactKey,
      });
      return undefined;
    }

    const sibling = desiredArtifacts.find(
      (artifact) =>
        artifact.instanceId === instance.id &&
        artifact.kind === "directory" &&
        artifact.path === path
    );
    if (sibling) {
      return {
        path,
        directory: {
          kind: "artifact",
          instanceId: sibling.instanceId,
          artifactKey: sibling.artifactKey,
        },
      };
    }

    return { path, directory: { kind: "inline", path } };
  } catch (error) {
    if (error instanceof PathEscapeError) {
      diagnostics.push({
        code: "path-escape",
        message: error.message,
        instanceId: instance.id,
        constructName: instance.construct.name,
        artifactKey,
        path: error.path,
      });
      return undefined;
    }
    throw error;
  }
}

function validatePathCompatibility(
  artifacts: readonly DesiredArtifact[],
  diagnostics: Diagnostic[]
): void {
  const byPath = new Map<string, DesiredArtifact[]>();
  for (const artifact of artifacts) {
    const list = byPath.get(artifact.path) ?? [];
    list.push(artifact);
    byPath.set(artifact.path, list);
  }

  for (const [path, group] of byPath) {
    if (group.length < 2) {
      continue;
    }

    const directories = group.filter((a) => a.kind === "directory");
    const files = group.filter((a) => a.kind === "file");

    if (directories.length > 1) {
      const identities = new Set(directories.map((a) => `${a.instanceId}::${a.artifactKey}`));
      if (identities.size > 1) {
        for (const artifact of directories) {
          diagnostics.push({
            code: "directory-path-collision",
            message: `Multiple directory artifacts claim path "${path}"`,
            instanceId: artifact.instanceId,
            constructName: artifact.constructName,
            artifactKey: artifact.artifactKey,
            path,
          });
        }
      }
    }

    if (files.length > 0 && directories.length > 0) {
      for (const artifact of group) {
        diagnostics.push({
          code: "path-collision",
          message: `File and directory artifacts collide at path "${path}"`,
          instanceId: artifact.instanceId,
          constructName: artifact.constructName,
          artifactKey: artifact.artifactKey,
          path,
        });
      }
    } else if (files.length > 1) {
      for (const artifact of files) {
        diagnostics.push({
          code: "path-collision",
          message: `Multiple artifacts claim path "${path}"`,
          instanceId: artifact.instanceId,
          constructName: artifact.constructName,
          artifactKey: artifact.artifactKey,
          path,
        });
      }
    }
  }

  // A file path must not be an ancestor of another artifact path.
  for (const artifact of artifacts) {
    if (artifact.kind !== "file") {
      continue;
    }
    const prefix = `${artifact.path}/`;
    for (const other of artifacts) {
      if (other.path.startsWith(prefix)) {
        diagnostics.push({
          code: "incompatible-paths",
          message: `File path "${artifact.path}" is an ancestor of "${other.path}"`,
          instanceId: artifact.instanceId,
          constructName: artifact.constructName,
          artifactKey: artifact.artifactKey,
          path: artifact.path,
        });
      }
    }
  }
}
