import type {
  ArtifactDescriptor,
  DirDescriptor,
  DirRef,
  FileContentFn,
  FileDescriptor,
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
  type PlacementRoot,
  type TreeDirNode,
  type TreeFileNode,
  type TreeNode,
} from "./tree";

export type { ArtifactDescriptor, DirRef, FileRef, FileMode, RootRef } from "./artifacts";
export { dir, file, root, FILENAME_PATTERN, isValidFilename } from "./artifacts";
export {
  DESTINATION,
  RESERVED_INSTANCE_KEYS,
  readDestination,
  type InPlacement,
  type PlacementRoot,
  type ReservedInstanceKey,
  type TreeDirNode,
  type TreeFileNode,
  type TreeNode,
} from "./tree";

/** Map a descriptor return shape to the bound refs dependents see on `.artifacts`. */
export type ArtifactRefsFromDescriptors<T extends Record<string, ArtifactDescriptor>> = {
  [K in keyof T]: T[K] extends DirDescriptor
    ? DirRef
    : T[K] extends FileDescriptor
      ? FileRef
      : DirRef | FileRef;
};

export type InstanceArtifacts = Record<string, DirRef | FileRef>;

/**
 * Erased construct definition for maps/registries. Specific definitions remain
 * generic so `defineConstruct` can type dependency `.artifacts`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentional erase for registries
export type AnyConstructDefinition = ConstructDefinition<any, any>;

export type InstanceRef<C extends AnyConstructDefinition = AnyConstructDefinition> = {
  readonly id: string;
  readonly name: string;
  readonly construct: C;
  readonly dependencies: Readonly<Record<string, InstanceRef>>;
  /** Filled during desired-inventory derivation for dependents' artifact callbacks. */
  artifacts: C extends ConstructDefinition<infer A, infer _Deps>
    ? ArtifactRefsFromDescriptors<A>
    : InstanceArtifacts;
};

export type ArtifactCallbackContextBase = {
  readonly name: string;
  readonly id: string;
};

/**
 * Context passed to a construct's artifact callback: `name` / `id` plus one
 * typed instance ref per declared dependency key.
 */
export type ArtifactCallbackContextFor<TDeps extends Record<string, AnyConstructDefinition>> =
  ArtifactCallbackContextBase & {
    readonly [K in keyof TDeps]: InstanceRef<TDeps[K]>;
  };

/** Loose context alias (prefer {@link ArtifactCallbackContextFor}). */
export type ArtifactCallbackContext = ArtifactCallbackContextBase &
  Record<string, InstanceRef | string | InstanceArtifacts | undefined>;

/**
 * Erased artifacts callback for runtime registries. Prefer inferring via
 * {@link ArchitectureBuilder.defineConstruct}.
 */
export type ArtifactCallback = (
  ctx: ArtifactCallbackContextBase & Record<string, unknown>
) => Record<string, ArtifactDescriptor>;

export type ConstructAuthoring = "flat" | "tree";

export type TreeBuildCallback = (
  ctx: ArtifactCallbackContextBase & Record<string, unknown>
) => InPlacement;

export type ConstructDefinition<
  TArtifacts extends Record<string, ArtifactDescriptor> = Record<string, ArtifactDescriptor>,
  TDeps extends Record<string, AnyConstructDefinition> = Record<string, AnyConstructDefinition>,
> = {
  readonly name: string;
  readonly architectureName: string;
  readonly dependencies: Readonly<TDeps>;
  /** Flat = legacy `defineConstruct`; tree = navigable `construct` + `A.in`. */
  readonly authoring: ConstructAuthoring;
  /**
   * Parameter is erased at the property type so specific no-deps definitions
   * stay assignable to {@link AnyConstructDefinition} (callback variance).
   * Call sites still get a precise ctx via {@link ArchitectureBuilder.defineConstruct}.
   * For tree constructs, re-runs placement flatten so apply content rendering works.
   */
  readonly buildArtifacts: ArtifactCallback;
  /** Present when {@link authoring} is `"tree"`. */
  readonly buildTree?: TreeBuildCallback;
  /** Phantom: carries descriptor map for dependents' `.artifacts` typing. */
  readonly __artifactMap?: TArtifacts;
};

export type Architecture = {
  readonly name: string;
  readonly constructs: ReadonlyMap<string, AnyConstructDefinition>;
};

type ArtifactsCallbackNoDeps<TArtifacts extends Record<string, ArtifactDescriptor>> = (
  ctx: ArtifactCallbackContextBase
) => TArtifacts;

type ArtifactsCallbackWithDeps<
  TDeps extends Record<string, AnyConstructDefinition>,
  TArtifacts extends Record<string, ArtifactDescriptor>,
> = (ctx: ArtifactCallbackContextFor<TDeps>) => TArtifacts;

/**
 * After `defineConstruct(name, deps)`, the returned function captures `TDeps`
 * so the artifacts callback can type dependency `.artifacts` precisely.
 */
export type DefineConstructWithDeps<TDeps extends Record<string, AnyConstructDefinition>> = <
  TArtifacts extends Record<string, ArtifactDescriptor>,
>(
  buildArtifacts: ArtifactsCallbackWithDeps<TDeps, TArtifacts>
) => ConstructDefinition<TArtifacts, TDeps>;

type TreeBuildCallbackFor<TDeps extends Record<string, AnyConstructDefinition>> = (
  ctx: ArtifactCallbackContextFor<TDeps>
) => InPlacement;

export type ArchitectureBuilder = {
  readonly name: string;
  /** Materialization-root DirRef for `A.in` destinations. */
  readonly rootDirectory: RootRef;
  /** No-dependency construct: `defineConstruct("X", ({ name }) => ({ ... }))`. */
  defineConstruct<TArtifacts extends Record<string, ArtifactDescriptor>>(
    name: string,
    buildArtifacts: ArtifactsCallbackNoDeps<TArtifacts>
  ): ConstructDefinition<TArtifacts, Record<string, never>>;
  /**
   * With dependencies — curried so `TDeps` is fixed before the artifacts callback:
   * `defineConstruct("X", { core })(({ name, core }) => ({ ... }))`.
   */
  defineConstruct<TDeps extends Record<string, AnyConstructDefinition>>(
    name: string,
    dependencies: TDeps
  ): DefineConstructWithDeps<TDeps>;
  /**
   * Navigable tree construct. `dependencies` is always required (`{}` ok).
   * Builder must return `A.in(destination, root)`.
   */
  construct<TDeps extends Record<string, AnyConstructDefinition>>(
    name: string,
    dependencies: TDeps,
    build: TreeBuildCallbackFor<TDeps>
  ): ConstructDefinition<Record<string, ArtifactDescriptor>, TDeps>;
  dir(path: string, children?: Record<string, TreeNode>): TreeDirNode;
  dir(children: Record<string, TreeNode>): TreeDirNode;
  file(
    filename: string,
    content?: string | FileContentFn,
    options?: { readonly mode?: FileMode }
  ): TreeFileNode;
  in(destination: DirRef, placementRoot: PlacementRoot): InPlacement;
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

  function registerFlat<
    TArtifacts extends Record<string, ArtifactDescriptor>,
    TDeps extends Record<string, AnyConstructDefinition>,
  >(
    constructName: string,
    dependencies: TDeps,
    buildArtifacts: ArtifactsCallbackWithDeps<TDeps, TArtifacts>
  ): ConstructDefinition<TArtifacts, TDeps> {
    assertUniqueAndDeps(constructName, dependencies);

    if (typeof buildArtifacts !== "function") {
      throw new Error(`defineConstruct("${constructName}") requires an artifacts callback`);
    }

    const definition: ConstructDefinition<TArtifacts, TDeps> = {
      name: constructName,
      architectureName: name,
      dependencies,
      authoring: "flat",
      buildArtifacts: buildArtifacts as ArtifactCallback,
    };
    constructs.set(constructName, definition);
    return definition;
  }

  function registerTree<TDeps extends Record<string, AnyConstructDefinition>>(
    constructName: string,
    dependencies: TDeps,
    build: TreeBuildCallbackFor<TDeps>
  ): ConstructDefinition<Record<string, ArtifactDescriptor>, TDeps> {
    assertUniqueAndDeps(constructName, dependencies);

    if (typeof build !== "function") {
      throw new Error(`construct("${constructName}") requires a placement callback`);
    }

    const buildTree: TreeBuildCallback = (ctx) => {
      const placement = build(ctx as ArtifactCallbackContextFor<TDeps>);
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

    const definition: ConstructDefinition<Record<string, ArtifactDescriptor>, TDeps> = {
      name: constructName,
      architectureName: name,
      dependencies,
      authoring: "tree",
      buildArtifacts,
      buildTree,
    };
    constructs.set(constructName, definition);
    return definition;
  }

  function defineConstruct(
    constructName: string,
    depsOrArtifacts:
      | Record<string, AnyConstructDefinition>
      | ArtifactsCallbackNoDeps<Record<string, ArtifactDescriptor>>
  ):
    | ConstructDefinition<Record<string, ArtifactDescriptor>, Record<string, never>>
    | DefineConstructWithDeps<Record<string, AnyConstructDefinition>> {
    if (typeof depsOrArtifacts === "function") {
      return registerFlat(constructName, {}, depsOrArtifacts);
    }

    const dependencies = depsOrArtifacts;
    return ((buildArtifacts) =>
      registerFlat(constructName, dependencies, buildArtifacts)) as DefineConstructWithDeps<
      typeof dependencies
    >;
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
    defineConstruct: defineConstruct as ArchitectureBuilder["defineConstruct"],
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
