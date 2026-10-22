import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createJiti } from "jiti";

import type { Structure } from "../structure/define-structure";
import type { Population } from "../population/create-population";

type StructureModule = {
  structure?: Structure;
  default?: Structure | { structure?: Structure };
};

type PopulationModule = {
  population?: Population;
  default?: Population | { population?: Population };
};

function createLoader(absolute: string) {
  // Disable caches so author edits to structure/population are visible on re-run
  // (e.g. migrate-id workflow: edit population.ts, then apply again).
  return createJiti(pathToFileURL(absolute).href, {
    moduleCache: false,
    fsCache: false,
  });
}

export async function loadStructure(modulePath: string): Promise<Structure> {
  const absolute = resolve(modulePath);
  const jiti = createLoader(absolute);
  const mod = (await jiti.import(absolute)) as StructureModule;

  const fromDefault =
    mod.default && typeof mod.default === "object" && "structure" in mod.default
      ? mod.default.structure
      : undefined;
  const structure =
    mod.structure ??
    (mod.default && isStructure(mod.default) ? mod.default : undefined) ??
    fromDefault;

  if (!structure || !isStructure(structure)) {
    throw new Error(
      `Structure module "${modulePath}" must export \`structure\` (or default Structure).`
    );
  }
  return structure;
}

export async function loadPopulation(modulePath: string): Promise<Population> {
  const absolute = resolve(modulePath);
  const jiti = createLoader(absolute);
  const mod = (await jiti.import(absolute)) as PopulationModule;

  const fromDefault =
    mod.default && typeof mod.default === "object" && "population" in mod.default
      ? mod.default.population
      : undefined;
  const population =
    mod.population ??
    (mod.default && isPopulation(mod.default) ? mod.default : undefined) ??
    fromDefault;

  if (!population || !isPopulation(population)) {
    throw new Error(
      `Population module "${modulePath}" must export \`population\` (or default Population).`
    );
  }
  return population;
}

function isStructure(value: unknown): value is Structure {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "constructs" in value &&
    value.constructs instanceof Map
  );
}

function isPopulation(value: unknown): value is Population {
  return (
    typeof value === "object" &&
    value !== null &&
    "structure" in value &&
    "instances" in value &&
    typeof (value as Population).add === "function"
  );
}
