import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createJiti } from "jiti";

import type { Architecture } from "../architecture/define-architecture";
import type { Population } from "../population/create-population";

type ArchitectureModule = {
  architecture?: Architecture;
  default?: Architecture | { architecture?: Architecture };
};

type PopulationModule = {
  population?: Population;
  default?: Population | { population?: Population };
};

function createLoader(absolute: string) {
  // Disable caches so author edits to architecture/population are visible on re-run
  // (e.g. migrate-id workflow: edit population.ts, then apply again).
  return createJiti(pathToFileURL(absolute).href, {
    moduleCache: false,
    fsCache: false,
  });
}

export async function loadArchitecture(modulePath: string): Promise<Architecture> {
  const absolute = resolve(modulePath);
  const jiti = createLoader(absolute);
  const mod = (await jiti.import(absolute)) as ArchitectureModule;

  const fromDefault =
    mod.default && typeof mod.default === "object" && "architecture" in mod.default
      ? mod.default.architecture
      : undefined;
  const architecture =
    mod.architecture ??
    (mod.default && isArchitecture(mod.default) ? mod.default : undefined) ??
    fromDefault;

  if (!architecture || !isArchitecture(architecture)) {
    throw new Error(
      `Architecture module "${modulePath}" must export \`architecture\` (or default Architecture).`
    );
  }
  return architecture;
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

function isArchitecture(value: unknown): value is Architecture {
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
    "architecture" in value &&
    "instances" in value &&
    typeof (value as Population).add === "function"
  );
}
