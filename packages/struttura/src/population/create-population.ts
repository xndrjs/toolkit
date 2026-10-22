import type { AnyConstructDefinition, Structure, InstanceRef } from "../structure/define-structure";

type StructureBuilderLike = {
  seal(): Structure;
};

type StructureSource = Structure | StructureBuilderLike;

export type RegisteredInstance = {
  readonly id: string;
  readonly name: string;
  readonly construct: AnyConstructDefinition;
  readonly dependencies: Readonly<Record<string, InstanceRef>>;
  artifacts: InstanceRef["artifacts"];
};

/**
 * Dependency slot for `population.add`: navigable refs omit `.artifacts` from
 * the public type but remain valid at runtime (RegisteredInstance still fills it).
 */
export type PopulateDependency =
  | InstanceRef
  | (Omit<InstanceRef, "artifacts"> & { readonly __constructBrand?: string });

export type CreatePopulationOptions = {
  /**
   * Stamp embedded by the generated populate API (ADR 0010). When set, apply
   * and inspect fail closed if it no longer matches the Structure.
   */
  readonly definitionStamp?: string;
};

export type Population = {
  readonly structure: Structure;
  /** Present when created via generated API (or tests supplying an explicit stamp). */
  readonly definitionStamp: string | undefined;
  readonly instances: readonly RegisteredInstance[];
  add(
    construct: AnyConstructDefinition,
    input: { name: string; id?: string } & Record<string, PopulateDependency | string | undefined>
  ): InstanceRef;
};

function isStructureBuilder(source: StructureSource): source is StructureBuilderLike {
  return typeof (source as StructureBuilderLike).seal === "function";
}

function resolveStructure(source: StructureSource): Structure {
  if (isStructureBuilder(source)) {
    return source.seal();
  }
  return source;
}

export function createPopulation(
  source: StructureSource,
  options: CreatePopulationOptions = {}
): Population {
  const structure = resolveStructure(source);
  const instances: RegisteredInstance[] = [];
  const byId = new Map<string, RegisteredInstance>();

  return {
    structure,
    definitionStamp: options.definitionStamp,
    get instances() {
      return instances;
    },
    add(construct, input) {
      if (construct.structureName !== structure.name) {
        throw new Error(
          `Construct "${construct.name}" belongs to structure "${construct.structureName}", not "${structure.name}"`
        );
      }
      if (!structure.constructs.has(construct.name)) {
        throw new Error(
          `Construct "${construct.name}" is not part of structure "${structure.name}"`
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
        dependencies[depKey] = depValue as InstanceRef;
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
