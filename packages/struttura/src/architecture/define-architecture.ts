import type {
  ArtifactDescriptor,
  DirDescriptor,
  DirRef,
  FileDescriptor,
  FileRef,
} from "./artifacts";

export type { ArtifactDescriptor, DirRef, FileRef, FileMode, RootRef } from "./artifacts";
export { dir, file, root, FILENAME_PATTERN, isValidFilename } from "./artifacts";

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

export type ConstructDefinition<
  TArtifacts extends Record<string, ArtifactDescriptor> = Record<string, ArtifactDescriptor>,
  TDeps extends Record<string, AnyConstructDefinition> = Record<string, AnyConstructDefinition>,
> = {
  readonly name: string;
  readonly architectureName: string;
  readonly dependencies: Readonly<TDeps>;
  /**
   * Parameter is erased at the property type so specific no-deps definitions
   * stay assignable to {@link AnyConstructDefinition} (callback variance).
   * Call sites still get a precise ctx via {@link ArchitectureBuilder.defineConstruct}.
   */
  readonly buildArtifacts: ArtifactCallback;
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

export type ArchitectureBuilder = {
  readonly name: string;
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
  /** Closed Architecture snapshot of constructs defined so far. */
  seal(): Architecture;
};

export function defineArchitecture(name: string): ArchitectureBuilder {
  const constructs = new Map<string, AnyConstructDefinition>();

  function register<
    TArtifacts extends Record<string, ArtifactDescriptor>,
    TDeps extends Record<string, AnyConstructDefinition>,
  >(
    constructName: string,
    dependencies: TDeps,
    buildArtifacts: ArtifactsCallbackWithDeps<TDeps, TArtifacts>
  ): ConstructDefinition<TArtifacts, TDeps> {
    if (constructs.has(constructName)) {
      throw new Error(`Construct "${constructName}" is already defined on architecture "${name}"`);
    }

    if (typeof buildArtifacts !== "function") {
      throw new Error(`defineConstruct("${constructName}") requires an artifacts callback`);
    }

    for (const [depKey, depConstruct] of Object.entries(dependencies)) {
      if (depConstruct.architectureName !== name) {
        throw new Error(
          `Dependency "${depKey}" of "${constructName}" belongs to architecture "${depConstruct.architectureName}", not "${name}"`
        );
      }
    }

    const definition: ConstructDefinition<TArtifacts, TDeps> = {
      name: constructName,
      architectureName: name,
      dependencies,
      buildArtifacts: buildArtifacts as ArtifactCallback,
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
      return register(constructName, {}, depsOrArtifacts);
    }

    const dependencies = depsOrArtifacts;
    return ((buildArtifacts) =>
      register(constructName, dependencies, buildArtifacts)) as DefineConstructWithDeps<
      typeof dependencies
    >;
  }

  return {
    name,
    defineConstruct: defineConstruct as ArchitectureBuilder["defineConstruct"],
    seal(): Architecture {
      return {
        name,
        constructs: new Map(constructs),
      };
    },
  };
}
