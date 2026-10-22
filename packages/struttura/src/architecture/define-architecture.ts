import type {
  ArtifactDescriptor,
  DirRef,
  FileContentFn,
  FileMode,
  FileRef,
  RootRef,
} from "./artifacts";
import {
  flattenPlacement,
  isInPlacement,
  readDestination,
  rootDirectory,
  treeDir,
  treeFile,
  treeIn,
  type InPlacement,
  type NavigableFromRoot,
  type PlacementDestination,
  type PlacementRoot,
  type TreeDirNode,
  type TreeFileNode,
  type TreeNode,
} from "./tree";

export type { ArtifactDescriptor, DirRef, FileRef, FileMode, RootRef } from "./artifacts";
export { FILENAME_PATTERN, isValidFilename } from "./artifacts";
export {
  DESTINATION,
  RESERVED_INSTANCE_KEYS,
  readDestination,
  type InPlacement,
  type NavigableFromNode,
  type NavigableFromPlacement,
  type NavigableFromRoot,
  type PlacementDestination,
  type PlacementRoot,
  type ReservedInstanceKey,
  type TreeDirNode,
  type TreeFileNode,
  type TreeNode,
} from "./tree";

export type ArtifactRefsFromDescriptors<T extends Record<string, ArtifactDescriptor>> = {
  [K in keyof T]: T[K] extends { readonly kind: "dir-descriptor" }
    ? DirRef
    : T[K] extends { readonly kind: "file-descriptor" }
      ? FileRef
      : DirRef | FileRef;
};

export type InstanceArtifacts = Record<string, DirRef | FileRef>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentional erase for registries
export type AnyConstructDefinition = ConstructDefinition<any, any, any>;

export type InstanceRef<C extends AnyConstructDefinition = AnyConstructDefinition> = {
  readonly id: string;
  readonly name: string;
  readonly construct: C;
  readonly dependencies: Readonly<Record<string, InstanceRef>>;
  /** Filled during desired-inventory derivation (internal; not part of navigable public shape). */
  artifacts: InstanceArtifacts;
};

/**
 * Sealed navigable instance: reserved InstanceRef fields plus tree shape
 * (DirRef/FileRef root + declared children).
 */
export type NavigableInstanceRef<C extends AnyConstructDefinition = AnyConstructDefinition> =
  InstanceRef<C> &
    (C extends ConstructDefinition<infer _A, infer _D, infer N> ? N : Record<string, never>);

export type ArtifactCallbackContextBase = {
  readonly name: string;
  readonly id: string;
};

/** Tree builder context: dependency instances expose navigable children. */
export type TreeCallbackContextFor<TDeps extends Record<string, AnyConstructDefinition>> =
  ArtifactCallbackContextBase & {
    readonly [K in keyof TDeps]: NavigableInstanceRef<TDeps[K]>;
  };

/** Loose context alias for runtime registries. */
export type ArtifactCallbackContext = ArtifactCallbackContextBase &
  Record<string, InstanceRef | string | InstanceArtifacts | undefined>;

export type ArtifactCallback = (
  ctx: ArtifactCallbackContextBase & Record<string, unknown>
) => Record<string, ArtifactDescriptor>;

export type TreeBuildCallback = (
  ctx: ArtifactCallbackContextBase & Record<string, unknown>
) => InPlacement;

export type ConstructDefinition<
  TArtifacts extends Record<string, ArtifactDescriptor> = Record<string, ArtifactDescriptor>,
  TDeps extends Record<string, AnyConstructDefinition> = Record<string, AnyConstructDefinition>,
  TNavigable extends object = Record<string, never>,
> = {
  readonly name: string;
  readonly architectureName: string;
  readonly dependencies: Readonly<TDeps>;
  /**
   * Parameter is erased at the property type so specific no-deps definitions
   * stay assignable to {@link AnyConstructDefinition} (callback variance).
   * Re-runs placement flatten so apply content rendering works.
   */
  readonly buildArtifacts: ArtifactCallback;
  readonly buildTree: TreeBuildCallback;
  /** Phantom: carries descriptor map for inventory probing. */
  readonly __artifactMap?: TArtifacts;
  /** Phantom: carries navigable instance shape for dependents. */
  readonly __navigable?: TNavigable;
};

export type Architecture = {
  readonly name: string;
  readonly constructs: ReadonlyMap<string, AnyConstructDefinition>;
};

type TreeBuildCallbackFor<
  TDeps extends Record<string, AnyConstructDefinition>,
  TRoot extends PlacementRoot,
> = (ctx: TreeCallbackContextFor<TDeps>) => InPlacement<TRoot>;

export type ArchitectureBuilder = {
  readonly name: string;
  /** Materialization-root DirRef for `A.in` destinations. */
  readonly rootDirectory: RootRef;
  /**
   * Navigable tree construct. `dependencies` is always required (`{}` ok).
   * Builder must return `A.in(destination, root)`; root shape is carried on the
   * definition so dependents see navigable children (e.g. `adapter.repositories`).
   */
  construct<TDeps extends Record<string, AnyConstructDefinition>, TRoot extends PlacementRoot>(
    name: string,
    dependencies: TDeps,
    build: TreeBuildCallbackFor<TDeps, TRoot>
  ): ConstructDefinition<Record<string, ArtifactDescriptor>, TDeps, NavigableFromRoot<TRoot>>;
  dir<C extends Record<string, TreeNode>>(path: string, children?: C): TreeDirNode<C>;
  dir<C extends Record<string, TreeNode>>(children: C): TreeDirNode<C>;
  file(
    filename: string,
    content?: string | FileContentFn,
    options?: { readonly mode?: FileMode }
  ): TreeFileNode;
  in<R extends PlacementRoot>(destination: PlacementDestination, placementRoot: R): InPlacement<R>;
  /** Read Destination from a sealed navigable instance (symbol slot). */
  destination(instance: object): DirRef;
  /** Closed Architecture snapshot of constructs defined so far. */
  seal(): Architecture;
};

export function defineArchitecture(name: string): ArchitectureBuilder {
  const constructs = new Map<string, AnyConstructDefinition>();

  function assertUniqueAndDeps(
    constructName: string,
    dependencies: Record<string, AnyConstructDefinition>
  ): void {
    if (constructs.has(constructName)) {
      throw new Error(`Construct "${constructName}" is already defined on architecture "${name}"`);
    }

    for (const [depKey, depConstruct] of Object.entries(dependencies)) {
      if (depConstruct.architectureName !== name) {
        throw new Error(
          `Dependency "${depKey}" of "${constructName}" belongs to architecture "${depConstruct.architectureName}", not "${name}"`
        );
      }
    }
  }

  function registerTree<
    TDeps extends Record<string, AnyConstructDefinition>,
    TRoot extends PlacementRoot,
  >(
    constructName: string,
    dependencies: TDeps,
    build: TreeBuildCallbackFor<TDeps, TRoot>
  ): ConstructDefinition<Record<string, ArtifactDescriptor>, TDeps, NavigableFromRoot<TRoot>> {
    assertUniqueAndDeps(constructName, dependencies);

    if (typeof build !== "function") {
      throw new Error(`construct("${constructName}") requires a placement callback`);
    }

    const buildTree: TreeBuildCallback = (ctx) => {
      const placement = build(ctx as TreeCallbackContextFor<TDeps>);
      if (!isInPlacement(placement)) {
        throw new Error(
          `construct("${constructName}") must return A.in(destination, root), got ${describeReturn(placement)}`
        );
      }
      return placement;
    };

    const buildArtifacts: ArtifactCallback = (ctx) => {
      const placement = buildTree(ctx);
      return flattenPlacement(placement, { constructName });
    };

    const definition: ConstructDefinition<
      Record<string, ArtifactDescriptor>,
      TDeps,
      NavigableFromRoot<TRoot>
    > = {
      name: constructName,
      architectureName: name,
      dependencies,
      buildArtifacts,
      buildTree,
    };
    constructs.set(constructName, definition);
    return definition;
  }

  function destinationOf(instance: object): DirRef {
    const dest = readDestination(instance);
    if (!dest) {
      throw new Error("A.destination requires a sealed navigable instance with a Destination");
    }
    return dest;
  }

  return {
    name,
    rootDirectory,
    construct: registerTree,
    dir: treeDir as ArchitectureBuilder["dir"],
    file: treeFile,
    in: treeIn,
    destination: destinationOf,
    seal(): Architecture {
      return {
        name,
        constructs: new Map(constructs),
      };
    },
  };
}

function describeReturn(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value !== "object") {
    return typeof value;
  }
  if ("kind" in value && typeof (value as { kind: unknown }).kind === "string") {
    return String((value as { kind: string }).kind);
  }
  return "object";
}
