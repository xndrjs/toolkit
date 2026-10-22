import type { Population } from "../population/create-population";
import type { Diagnostic } from "../inventory/derive-desired-inventory";
import { computeDefinitionStamp } from "./emit-populate-api";

/**
 * Fail closed when a generated populate API's DEFINITION_STAMP no longer matches
 * the Structure (ADR 0010). Populations without an explicit stamp (hand-built
 * collectors in tests) are treated as fresh.
 */
export function checkDefinitionStamp(population: Population): Diagnostic | undefined {
  if (population.definitionStamp === undefined) {
    return undefined;
  }
  const expected = computeDefinitionStamp(population.structure);
  if (population.definitionStamp === expected) {
    return undefined;
  }
  return {
    code: "stale-generated-api",
    message:
      "Generated populate API is stale: DEFINITION_STAMP does not match the Structure. Run codegen and commit the updated API.",
  };
}
