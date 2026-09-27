import type { Program, ResourceDefinition } from "../../../ir";

export type ResourceIndex = Map<string, ResourceDefinition>;

export function resourceIndex(program: Program): ResourceIndex {
  return new Map(program.resources.map((r) => [r.name, r]));
}
