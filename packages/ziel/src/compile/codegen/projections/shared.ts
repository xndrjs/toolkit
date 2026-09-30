import type { Program, TypeExpr } from "../../../ir";

export type ResourceIndex = ReadonlyMap<string, { payloadType: TypeExpr }>;

export function resourceIndex(program: Program): ResourceIndex {
  return new Map(program.resources.map((r) => [r.name, r]));
}
