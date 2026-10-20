import type { ArtifactDescriptor, DirRef, FileRef } from "./artifacts";

export type { ArtifactDescriptor, DirRef, FileRef, FileMode, RootRef } from "./artifacts";
export { dir, file, root, FILENAME_PATTERN, isValidFilename } from "./artifacts";

export type InstanceArtifacts = Record<string, DirRef | FileRef>;

export type InstanceRef = {
  readonly id: string;
  readonly name: string;
  readonly construct: ConstructDefinition;
  readonly dependencies: Readonly<Record<string, InstanceRef>>;
  /** Filled during desired-inventory derivation for dependents' artifact callbacks. */
  artifacts: InstanceArtifacts;
};

/**
 * Context passed to a construct's artifact callback.
 * Dependency keys and `.artifacts` are attached at runtime; literal DirRef/FileRef
 * typing arrives with codegen (ADR 0012 / ticket 08).
 */
export type ArtifactCallbackContext = {
  readonly name: string;
  readonly id: string;
  readonly artifacts?: InstanceArtifacts;
} & Record<string, InstanceRef | string | InstanceArtifacts | undefined>;

/**
 * Artifacts callback. Context typing is intentionally unchecked until codegen
 * brands dependency and artifact refs (ticket 08).
 */
export type ArtifactCallback = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pre-codegen context; branded in ticket 08
  ctx: any
) => Record<string, ArtifactDescriptor>;

export type ConstructDefinition = {
  readonly name: string;
  readonly architectureName: string;
  readonly dependencies: Readonly<Record<string, ConstructDefinition>>;
  readonly buildArtifacts: ArtifactCallback;
};

export type Architecture = {
  readonly name: string;
  readonly constructs: ReadonlyMap<string, ConstructDefinition>;
};

export type ArchitectureBuilder = {
  readonly name: string;
  defineConstruct(name: string, buildArtifacts: ArtifactCallback): ConstructDefinition;
  defineConstruct(
    name: string,
    dependencies: Record<string, ConstructDefinition>,
    buildArtifacts: ArtifactCallback
  ): ConstructDefinition;
  /** Closed Architecture snapshot of constructs defined so far. */
  seal(): Architecture;
};

export function defineArchitecture(name: string): ArchitectureBuilder {
  const constructs = new Map<string, ConstructDefinition>();

  function defineConstruct(
    constructName: string,
    depsOrArtifacts: Record<string, ConstructDefinition> | ArtifactCallback,
    maybeArtifacts?: ArtifactCallback
  ): ConstructDefinition {
    if (constructs.has(constructName)) {
      throw new Error(`Construct "${constructName}" is already defined on architecture "${name}"`);
    }

    const dependencies: Record<string, ConstructDefinition> =
      typeof depsOrArtifacts === "function" ? {} : depsOrArtifacts;
    const buildArtifacts: ArtifactCallback =
      typeof depsOrArtifacts === "function" ? depsOrArtifacts : maybeArtifacts!;

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

    const definition: ConstructDefinition = {
      name: constructName,
      architectureName: name,
      dependencies,
      buildArtifacts,
    };
    constructs.set(constructName, definition);
    return definition;
  }

  return {
    name,
    defineConstruct,
    seal(): Architecture {
      return {
        name,
        constructs: new Map(constructs),
      };
    },
  };
}
