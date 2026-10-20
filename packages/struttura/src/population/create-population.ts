import type {
  Architecture,
  ConstructDefinition,
  InstanceRef,
} from "../architecture/define-architecture";

type ArchitectureBuilderLike = {
  seal(): Architecture;
};

type ArchitectureSource = Architecture | ArchitectureBuilderLike;

export type RegisteredInstance = {
  readonly id: string;
  readonly name: string;
  readonly construct: ConstructDefinition;
  readonly dependencies: Readonly<Record<string, InstanceRef>>;
  artifacts: InstanceRef["artifacts"];
};

export type Population = {
  readonly architecture: Architecture;
  readonly instances: readonly RegisteredInstance[];
  add(
    construct: ConstructDefinition,
    input: { name: string; id?: string } & Record<string, InstanceRef | string | undefined>
  ): InstanceRef;
};

function isArchitectureBuilder(source: ArchitectureSource): source is ArchitectureBuilderLike {
  return typeof (source as ArchitectureBuilderLike).seal === "function";
}

function resolveArchitecture(source: ArchitectureSource): Architecture {
  if (isArchitectureBuilder(source)) {
    return source.seal();
  }
  return source;
}

export function createPopulation(source: ArchitectureSource): Population {
  const architecture = resolveArchitecture(source);
  const instances: RegisteredInstance[] = [];
  const byId = new Map<string, RegisteredInstance>();

  return {
    architecture,
    get instances() {
      return instances;
    },
    add(construct, input) {
      if (construct.architectureName !== architecture.name) {
        throw new Error(
          `Construct "${construct.name}" belongs to architecture "${construct.architectureName}", not "${architecture.name}"`
        );
      }
      if (!architecture.constructs.has(construct.name)) {
        throw new Error(
          `Construct "${construct.name}" is not part of architecture "${architecture.name}"`
        );
      }

      const name = input.name;
      if (typeof name !== "string" || name.length === 0) {
        throw new Error(`Instance of "${construct.name}" requires a non-empty name`);
      }

      const id = input.id ?? name;
      if (byId.has(id)) {
        // Still register for derive to report a structured diagnostic.
      }

      const dependencies: Record<string, InstanceRef> = {};
      for (const depKey of Object.keys(construct.dependencies)) {
        const depValue = input[depKey];
        if (depValue === undefined || typeof depValue === "string" || !isInstanceRef(depValue)) {
          throw new Error(
            `Instance "${id}" of "${construct.name}" is missing dependency "${depKey}"`
          );
        }
        const expected = construct.dependencies[depKey]!;
        if (depValue.construct.name !== expected.name) {
          throw new Error(
            `Instance "${id}" dependency "${depKey}" expected construct "${expected.name}", got "${depValue.construct.name}"`
          );
        }
        dependencies[depKey] = depValue;
      }

      const registered: RegisteredInstance = {
        id,
        name,
        construct,
        dependencies,
        artifacts: {},
      };
      instances.push(registered);
      byId.set(id, registered);
      return registered;
    },
  };
}

function isInstanceRef(value: unknown): value is InstanceRef {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "construct" in value &&
    "artifacts" in value
  );
}
