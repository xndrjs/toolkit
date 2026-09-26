/**
 * Emit open `createGraphResolutionStrategy` builders from checked queries.
 * Local expansions only — no islands, root helpers, or `.build()`.
 * Armed `on` projections emit one `.on(ari).when(…).expand(…)` per arm that
 * expands; flat `on` stays `.on(ari).expand(…)`.
 * Collection expand targets get an auto member-ARI fan-out `.on(collectionAri)`.
 */
import type {
  ExpandArm,
  Expansion,
  FieldDecl,
  Program,
  ProjectionArm,
  QueryDefinition,
  ResourceDefinition,
  ResourceProjection,
  TypeExpr,
} from "../../../ir";
import { emitConstruction } from "./emit-construction";
import { emitExpr } from "./emit-expr";
import { printTypeExpr } from "./emit-types";
import {
  ariFactoryName,
  executionContextTypeName,
  paramsTypeName,
  strategyFactoryName,
} from "../naming";

function emitObjectTypeAlias(name: string, fields: FieldDecl[]): string {
  const body = printTypeExpr({ kind: "object", fields, span: null });
  return `export type ${name} = ${body};`;
}

function emitArmManyExpr(sourceExpr: string, itemBinding: string, arm: ExpandArm): string {
  const construction = emitConstruction(arm.target);
  const mapFn = `(${itemBinding}: any) => ${construction}`;
  if (arm.when !== null) {
    return `${sourceExpr}.filter((${itemBinding}: any) => ${emitExpr(arm.when)}).map(${mapFn})`;
  }
  return `${sourceExpr}.map(${mapFn})`;
}

/** Multi-arm `each`: flatMap so source order is preserved (not concat-by-arm). */
function emitMultiArmFlatMap(sourceExpr: string, itemBinding: string, arms: ExpandArm[]): string {
  const branches = arms.map((arm) => {
    const construction = emitConstruction(arm.target);
    if (arm.when !== null) {
      return `if (${emitExpr(arm.when)}) return [${construction}];`;
    }
    return `return [${construction}];`;
  });
  // Trailing empty return covers non-matching items when every arm has `when`.
  const body = [...branches, `return [];`].join("\n          ");
  return `${sourceExpr}.flatMap((${itemBinding}: any): any[] => {\n          ${body}\n        })`;
}

/**
 * One expansion contribution to the `resources` array.
 * - `one` → single ARI construction
 * - `many` → `source[.filter].map` or order-preserving multi-arm `flatMap`
 */
function emitManyExpr(expansion: Expansion): string {
  const comprehension = expansion.comprehension;
  if (comprehension === null) {
    throw new Error("emitStrategies: many expansion missing comprehension");
  }

  const { itemBinding, source, arms } = comprehension;
  const sourceExpr = emitExpr(source);
  if (arms.length === 1) {
    return emitArmManyExpr(sourceExpr, itemBinding, arms[0]!);
  }
  return emitMultiArmFlatMap(sourceExpr, itemBinding, arms);
}

function emitExpansionContribution(expansion: Expansion): string {
  if (expansion.multiplicity === "one" || expansion.comprehension === null) {
    if (expansion.target === null) {
      throw new Error("emitStrategies: one-expand missing target");
    }
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
    if (only.target === null) {
      throw new Error("emitStrategies: one-expand missing target");
    }
    return `[${emitConstruction(only.target)}]`;
  }

  const parts = expansions.map(emitExpansionContribution);
  return `[\n        ${parts.join(",\n        ")},\n      ]`;
}

function emitFlatProjectionExpansion(projection: ResourceProjection): string {
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

function emitArmedProjectionExpansion(projection: ResourceProjection, arm: ProjectionArm): string {
  const ari = ariFactoryName(projection.resource);
  const resources = emitResourcesArray(arm.expansions);
  const whenPred = emitExpr(arm.when);

  return [
    `  strategy.expansion`,
    `    .on(${ari})`,
    `    .when(({ resource, payload, executionContext }) => ${whenPred})`,
    `    .expand(({ resource, payload, executionContext }) => ({`,
    `      resources: ${resources},`,
    `    }));`,
  ].join("\n");
}

/**
 * Expansion policy blocks for one `on` projection.
 * Armed projections contribute one policy per arm that has expansions;
 * arms with fields only (no expand) are omitted from the strategy.
 */
function emitProjectionExpansions(projection: ResourceProjection): string[] {
  if (projection.arms !== null) {
    return projection.arms
      .filter((arm) => arm.expansions.length > 0)
      .map((arm) => emitArmedProjectionExpansion(projection, arm));
  }
  if (projection.expansions.length === 0) {
    return [];
  }
  return [emitFlatProjectionExpansion(projection)];
}

/** All expansions under a projection (flat body or flattened when-arms). */
function allProjectionExpansions(projection: ResourceProjection): Expansion[] {
  if (projection.arms !== null) {
    return projection.arms.flatMap((arm) => arm.expansions);
  }
  return projection.expansions;
}

/** Collection resource (`TabCollection: Tab[]`) → element resource name. */
function collectionElement(payload: TypeExpr): string | null {
  if (payload.kind === "array" && payload.of.kind === "resourceRef") {
    return payload.of.name;
  }
  return null;
}

/**
 * After expanding a collection ARI, enqueue member ARIs so `on Member` runs.
 * Identity args: payload field when present on the element resource identity name,
 * else `executionContext.<name>` when the query declares that context field.
 */
function emitCollectionFanOut(
  collection: ResourceDefinition,
  element: ResourceDefinition,
  contextFields: FieldDecl[]
): string {
  const collectionAri = ariFactoryName(collection.name);
  const elementAri = ariFactoryName(element.name);
  const contextNames = new Set(contextFields.map((f) => f.name));

  const argParts = element.identity.fields.map((field) => {
    if (contextNames.has(field.name)) {
      return `${field.name}: executionContext.${field.name}`;
    }
    return `${field.name}: item.${field.name}`;
  });

  return [
    `  strategy.expansion`,
    `    .on(${collectionAri})`,
    `    .expand(({ payload, executionContext }) => ({`,
    `      resources: payload.map((item: any) => ${elementAri}({ ${argParts.join(", ")} })),`,
    `    }));`,
  ].join("\n");
}

function collectCollectionFanOuts(
  query: QueryDefinition,
  resourceIndex: Map<string, ResourceDefinition>
): string[] {
  const seen = new Set<string>();
  const blocks: string[] = [];

  for (const projection of query.projections) {
    for (const expansion of allProjectionExpansions(projection)) {
      if (expansion.multiplicity !== "one" || expansion.target === null) continue;
      const collection = resourceIndex.get(expansion.target.resource);
      if (!collection) continue;
      const elementName = collectionElement(collection.payloadType);
      if (elementName === null) continue;
      if (seen.has(collection.name)) continue;
      seen.add(collection.name);

      const element = resourceIndex.get(elementName);
      if (!element) {
        throw new Error(
          `emitStrategies: collection '${collection.name}' element '${elementName}' is unknown`
        );
      }
      blocks.push(emitCollectionFanOut(collection, element, query.context));
    }
  }

  return blocks;
}

function emitQueryStrategy(
  query: QueryDefinition,
  registryTypeName: string,
  resourceIndex: Map<string, ResourceDefinition>
): string {
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

  const fanOutBlocks = collectCollectionFanOuts(query, resourceIndex);

  const bodyLines: string[] = [
    `  const strategy = createGraphResolutionStrategy<`,
    `    ${executionContextType},`,
    `    ${registryTypeName}`,
    `  >();`,
  ];

  if (expansionBlocks.length > 0 || fanOutBlocks.length > 0) {
    bodyLines.push("");
    bodyLines.push([...expansionBlocks, ...fanOutBlocks].join("\n\n"));
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

  const resourceIndex = new Map(program.resources.map((r) => [r.name, r]));
  return program.queries
    .map((query) => emitQueryStrategy(query, registryTypeName, resourceIndex))
    .join("\n\n");
}
