import type { FileContentFn, FileMode, DirRef, RootRef } from "./artifacts";
import { dir, file, joinPath, normalizeRelativePath, root } from "./artifacts";
import type { ArtifactDescriptor } from "./artifacts";

/** Private slot for Destination; not enumerable as a string key. */
export const DESTINATION = Symbol("struttura.destination");

export const RESERVED_INSTANCE_KEYS = ["name", "id", "construct", "dependencies", "path"] as const;

export type ReservedInstanceKey = (typeof RESERVED_INSTANCE_KEYS)[number];

const RESERVED_SET = new Set<string>(RESERVED_INSTANCE_KEYS);

export function isReservedInstanceKey(key: string): key is ReservedInstanceKey {
  return RESERVED_SET.has(key);
}

export type TreeFileNode = {
  readonly kind: "tree-file";
  readonly filename: string;
  readonly mode: FileMode;
  readonly content?: string | FileContentFn;
};

export type TreeDirNode = {
  readonly kind: "tree-dir";
  /** Physical path relative to the parent node (or to Destination when this is the placement root). */
  readonly path: string;
  readonly children: Readonly<Record<string, TreeNode>>;
};

export type TreeNode = TreeFileNode | TreeDirNode;

/** Peer-root sibling map (ticket 02); detected at runtime by absence of `kind`. */
export type PeerRootMap = Readonly<Record<string, TreeNode>>;

export type PlacementRoot = TreeDirNode | TreeFileNode | PeerRootMap;

export type InPlacement = {
  readonly kind: "in-placement";
  readonly destination: DirRef;
  readonly root: PlacementRoot;
};

export class ReservedKeyCollisionError extends Error {
  constructor(
    public readonly key: string,
    public readonly constructName?: string
  ) {
    super(
      `Child key "${key}" collides with reserved instance field${
        constructName ? ` on construct "${constructName}"` : ""
      }`
    );
    this.name = "ReservedKeyCollisionError";
  }
}

export class InvalidPlacementRootError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPlacementRootError";
  }
}

export class InvalidAuthoringKeyError extends Error {
  constructor(public readonly key: string) {
    super(`Authoring map key must not contain "." (got "${key}")`);
    this.name = "InvalidAuthoringKeyError";
  }
}

export function isTreeFileNode(value: unknown): value is TreeFileNode {
  return isRecord(value) && value.kind === "tree-file";
}

export function isTreeDirNode(value: unknown): value is TreeDirNode {
  return isRecord(value) && value.kind === "tree-dir";
}

export function isInPlacement(value: unknown): value is InPlacement {
  return isRecord(value) && value.kind === "in-placement";
}

export function isPeerRootMap(value: unknown): value is PeerRootMap {
  if (!isRecord(value) || "kind" in value) {
    return false;
  }
  return Object.values(value).every((child) => isTreeFileNode(child) || isTreeDirNode(child));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Materialization-root DirRef used as `A.rootDirectory`. */
export const rootDirectory: RootRef = root;

export function treeFile(
  filename: string,
  content?: string | FileContentFn,
  options?: { readonly mode?: FileMode }
): TreeFileNode {
  return Object.freeze({
    kind: "tree-file",
    filename,
    mode: options?.mode ?? "scaffold",
    ...(content === undefined ? {} : { content }),
  });
}

export function treeDir(
  pathOrChildren: string | Record<string, TreeNode>,
  maybeChildren?: Record<string, TreeNode>
): TreeDirNode {
  if (typeof pathOrChildren === "string") {
    return Object.freeze({
      kind: "tree-dir",
      path: normalizeRelativePath(pathOrChildren),
      children: Object.freeze({ ...(maybeChildren ?? {}) }),
    });
  }
  return Object.freeze({
    kind: "tree-dir",
    path: "",
    children: Object.freeze({ ...pathOrChildren }),
  });
}

export function treeIn(destination: DirRef, placementRoot: PlacementRoot): InPlacement {
  return Object.freeze({
    kind: "in-placement",
    destination,
    root: placementRoot,
  });
}

export function readDestination(instance: object): DirRef | undefined {
  const value = (instance as Record<symbol, unknown>)[DESTINATION];
  if (isRecord(value) && (value.kind === "root" || value.kind === "directory")) {
    return value as DirRef;
  }
  return undefined;
}

/**
 * Flatten an `A.in` placement into the legacy flat descriptor map.
 * Ticket 01 supports directory roots under a Destination; peer/file roots error.
 */
export function flattenPlacement(
  placement: InPlacement,
  options: { readonly constructName?: string } = {}
): Record<string, ArtifactDescriptor> {
  const { destination, root: placementRoot } = placement;

  if (isTreeFileNode(placementRoot)) {
    throw new InvalidPlacementRootError(
      `Construct "${options.constructName ?? "?"}" file-root placement is not supported in this step`
    );
  }
  if (isPeerRootMap(placementRoot)) {
    throw new InvalidPlacementRootError(
      `Construct "${options.constructName ?? "?"}" peer-root placement is not supported in this step`
    );
  }
  if (!isTreeDirNode(placementRoot)) {
    throw new InvalidPlacementRootError(
      `Construct "${options.constructName ?? "?"}" A.in root must be A.dir(...)`
    );
  }

  const basePath =
    destination.kind === "root"
      ? placementRoot.path
      : joinPath(destination.path, placementRoot.path);

  const out: Record<string, ArtifactDescriptor> = {};
  emitDir(out, ".", basePath, placementRoot.children, options.constructName);
  return out;
}

function emitDir(
  out: Record<string, ArtifactDescriptor>,
  artifactKey: string,
  absolutePath: string,
  children: Readonly<Record<string, TreeNode>>,
  constructName: string | undefined
): void {
  if (absolutePath === "" || absolutePath === ".") {
    throw new InvalidPlacementRootError(
      `Construct "${constructName ?? "?"}" cannot claim the materialization root as a directory artifact`
    );
  }

  out[artifactKey] = dir(absolutePath);

  for (const [childKey, child] of Object.entries(children)) {
    assertAuthoringKey(childKey, constructName);
    const childArtifactKey = artifactKey === "." ? childKey : `${artifactKey}.${childKey}`;

    if (isTreeFileNode(child)) {
      out[childArtifactKey] = file({
        filename: child.filename,
        directory: dir(absolutePath),
        mode: child.mode,
        ...(child.content === undefined ? {} : { content: child.content }),
      });
      continue;
    }

    if (isTreeDirNode(child)) {
      const childPath =
        child.path === "" ? joinPath(absolutePath, childKey) : joinPath(absolutePath, child.path);
      emitDir(out, childArtifactKey, childPath, child.children, constructName);
      continue;
    }

    throw new InvalidPlacementRootError(
      `Construct "${constructName ?? "?"}" has invalid child "${childKey}" under "${artifactKey}"`
    );
  }
}

function assertAuthoringKey(key: string, constructName: string | undefined): void {
  if (key.includes(".")) {
    throw new InvalidAuthoringKeyError(key);
  }
  if (isReservedInstanceKey(key)) {
    throw new ReservedKeyCollisionError(key, constructName);
  }
}

/**
 * Project bound flat artifact refs onto a navigable instance (root DirRef + nested children).
 * Leaves `artifacts` non-enumerable for engine use; Destination stays on {@link DESTINATION}.
 */
export function sealNavigableInstance(
  instance: Record<string, unknown>,
  artifacts: Record<
    string,
    { readonly kind: string; readonly path: string } & Record<string, unknown>
  >,
  destination: DirRef
): void {
  Object.defineProperty(instance, DESTINATION, {
    value: destination,
    enumerable: false,
    configurable: true,
  });

  const rootRef = artifacts["."];
  if (rootRef && (rootRef.kind === "directory" || rootRef.kind === "file")) {
    for (const [key, value] of Object.entries(rootRef)) {
      if (key === "path" || !(key in instance)) {
        instance[key] = value;
      }
    }
    instance.path = rootRef.path;
  }

  const nestedKeys = Object.keys(artifacts)
    .filter((key) => key !== ".")
    .sort((a, b) => {
      const depth = a.split(".").length - b.split(".").length;
      return depth !== 0 ? depth : a < b ? -1 : a > b ? 1 : 0;
    });

  for (const key of nestedKeys) {
    const parts = key.split(".");
    let cursor: Record<string, unknown> = instance;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      const prefix = parts.slice(0, i + 1).join(".");
      const existing = cursor[part];
      if (!isRecord(existing)) {
        const dirArtifact = artifacts[prefix];
        cursor[part] = dirArtifact ? { ...dirArtifact } : {};
      }
      cursor = cursor[part] as Record<string, unknown>;
    }
    const leaf = parts[parts.length - 1]!;
    const ref = artifacts[key]!;
    if (ref.kind === "directory") {
      const prior = isRecord(cursor[leaf]) ? cursor[leaf] : {};
      cursor[leaf] = { ...ref, ...prior };
    } else {
      cursor[leaf] = ref;
    }
  }

  Object.defineProperty(instance, "artifacts", {
    value: artifacts,
    enumerable: false,
    writable: true,
    configurable: true,
  });
}
