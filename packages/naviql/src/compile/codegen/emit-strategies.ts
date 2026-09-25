/**
 * Emit open `createGraphResolutionStrategy` builders from checked queries.
 * Local expansions only — no islands, `.when()`, root helpers, or `.build()`.
 */
import type { Expansion, FieldDecl, Program, QueryDefinition, ResourceProjection } from "../../ir";
import { emitConstruction } from "./emit-construction";
import { emitExpr } from "./emit-expr";
import { printTypeExpr } from "./emit-types";
import {
  ariFactoryName,
  executionContextTypeName,
  paramsTypeName,
  strategyFactoryName,
} from "./naming";

function emitObjectTypeAlias(name: string, fields: FieldDecl[]): string {
  const body = printTypeExpr({ kind: "object", fields, span: null });
  return `export type ${name} = ${body};`;
}

/**
 * One expansion contribution to the `resources` array.
 * - `one` → single ARI construction
 * - `many` → `...source[.filter].map` (spread into the array)
 */
function emitManyExpr(expansion: Expansion): string {
  const comprehension = expansion.comprehension;
  if (comprehension === null) {
    throw new Error("emitStrategies: many expansion missing comprehension");
  }

  const construction = emitConstruction(expansion.target);
  const { itemBinding, source, filter } = comprehension;
  const sourceExpr = emitExpr(source);
  const mapFn = `(${itemBinding}) => ${construction}`;

  if (filter !== null) {
    return `${sourceExpr}.filter((${itemBinding}) => ${emitExpr(filter)}).map(${mapFn})`;
  }

  return `${sourceExpr}.map(${mapFn})`;
}

function emitExpansionContribution(expansion: Expansion): string {
  if (expansion.multiplicity === "one" || expansion.comprehension === null) {
    return emitConstruction(expansion.target);
  }

  return `...${emitManyExpr(expansion)}`;
}

function emitResourcesArray(expansions: Expansion[]): string {
  if (expansions.length === 1) {
    const only = expansions[0]!;
    // A lone `many` already yields an array — avoid `[...xs.map(...)]`.
    if (only.multiplicity === "many" && only.comprehension !== null) {
      return emitManyExpr(only);
    }
    return `[${emitConstruction(only.target)}]`;
  }

  const parts = expansions.map(emitExpansionContribution);
  return `[\n        ${parts.join(",\n        ")},\n      ]`;
}

function emitProjectionExpansion(projection: ResourceProjection): string {
  const ari = ariFactoryName(projection.resource);
  const resources = emitResourcesArray(projection.expansions);

  return [
    `  strategy.expansion`,
    `    .on(${ari})`,
    `    .expand(({ resource, payload, executionContext }) => ({`,
    `      resources: ${resources},`,
    `    }));`,
  ].join("\n");
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

  const expansionBlocks = query.projections
    .filter((p) => p.expansions.length > 0)
    .map(emitProjectionExpansion);

  const bodyLines: string[] = [
    `  const strategy = createGraphResolutionStrategy<`,
    `    ${executionContextType},`,
    `    ${registryTypeName}`,
    `  >();`,
  ];

  if (expansionBlocks.length > 0) {
    bodyLines.push("");
    bodyLines.push(expansionBlocks.join("\n\n"));
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
