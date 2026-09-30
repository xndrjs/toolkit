/**
 * Emit open `createGraphResolutionStrategy` builders from checked queries.
 * Local expansions, resolve policies, and island policies — no root helpers
 * or `.build()`.
 * Armed `on` projections emit one `.on(ari).when(…).expand(…)` per arm that
 * expands; flat `on` stays `.on(ari).expand(…)`.
 * 1→1 resolve-only `on R resolve to { … }` emits `.resolve.on(ari)[.when(…)].to(…)`.
 * Many-resolve `on R resolve to each …` emits expansion-backed
 * `.expansion.on(ari).expand(…)` (same each/flatMap shape; no redirects).
 * Query `islands` emit `.islands.on(ari)[.when(…)].startIsland()` before return.
 *
 * Callbacks take a single `predicate` and use dot access (no destructuring).
 */
import type { FieldDecl, Program, QueryDefinition } from "../../../ir";
import { printTypeExpr } from "../resources";
import { executionContextTypeName, paramsTypeName, strategyFactoryName } from "../naming";
import { emitProjectionExpansions } from "./emit-expansion";
import { emitIslands } from "./emit-islands";
import { emitProjectionResolves } from "./emit-resolve-policies";

function emitObjectTypeAlias(name: string, fields: FieldDecl[]): string {
  const body = printTypeExpr({ kind: "object", fields, span: null });
  return `export type ${name} = ${body};`;
}

function emitQueryStrategy(query: QueryDefinition, registryTypeName: string): string {
  const factory = strategyFactoryName(query.name);
  const paramsName = paramsTypeName(query.name);
  const contextName = executionContextTypeName(query.name);
  const hasParams = query.parameters.length > 0;
  const hasContext = query.context.length > 0;

  const parts: string[] = [];

  if (hasParams) {
    parts.push(emitObjectTypeAlias(paramsName, query.parameters));
  }
  if (hasContext) {
    parts.push(emitObjectTypeAlias(contextName, query.context));
  }

  const executionContextType = hasContext ? contextName : "unknown";
  const factorySig = hasParams
    ? `function ${factory}(params: ${paramsName})`
    : `function ${factory}()`;

  const expansionBlocks = query.projections.flatMap(emitProjectionExpansions);
  const resolveBlocks = query.projections.flatMap(emitProjectionResolves);
  const islandBlocks = emitIslands(query.islands);

  const bodyLines: string[] = [
    `  const strategy = createGraphResolutionStrategy<`,
    `    ${executionContextType},`,
    `    ${registryTypeName}`,
    `  >();`,
  ];

  const policyBlocks = [...expansionBlocks, ...resolveBlocks, ...islandBlocks];
  if (policyBlocks.length > 0) {
    bodyLines.push("");
    bodyLines.push(policyBlocks.join("\n\n"));
  }

  bodyLines.push("");
  bodyLines.push(`  return strategy;`);

  parts.push(`export ${factorySig} {\n${bodyLines.join("\n")}\n}`);

  return parts.join("\n\n");
}

/**
 * Emit params/context types and `create*Strategy` factories for each query.
 * Returns an empty string when the program has no queries.
 *
 * @param registryTypeName - Registry generic on `createGraphResolutionStrategy` (default `ContentRegistry`).
 */
export function emitStrategies(program: Program, registryTypeName = "ContentRegistry"): string {
  if (program.queries.length === 0) {
    return "";
  }

  return program.queries.map((query) => emitQueryStrategy(query, registryTypeName)).join("\n\n");
}
