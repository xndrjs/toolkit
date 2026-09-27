/**
 * Expansion policy emit helpers for open `createGraphResolutionStrategy` builders.
 * Armed `on` projections emit one `.on(ari).when(…).expand(…)` per arm that
 * expands; flat `on` stays `.on(ari).expand(…)`.
 * Collection expand targets get an auto member-ARI fan-out `.on(collectionAri)`.
 */
import type {
  ExpandArm,
  Expansion,
  FieldDecl,
  ProjectionArm,
  QueryDefinition,
  ResourceDefinition,
  ResourceProjection,
  TypeExpr,
} from "../../../ir";
import {
  emitConstruction,
  emitExpr,
  strategyArmedBodyScope,
  strategyExprScope,
  type EmitExprScope,
} from "../shared";
import { ariFactoryName } from "../naming";

function emitArmManyExpr(
  sourceExpr: string,
  itemBinding: string,
  arm: ExpandArm,
  scope: EmitExprScope
): string {
  const construction = emitConstruction(arm.target, scope);
  const mapFn = `(${itemBinding}: any) => ${construction}`;
  if (arm.when !== null) {
    return `${sourceExpr}.filter((${itemBinding}: any) => ${emitExpr(arm.when, scope)}).map(${mapFn})`;
  }
  return `${sourceExpr}.map(${mapFn})`;
}

/** Multi-arm `each`: flatMap so source order is preserved (not concat-by-arm). */
function emitMultiArmFlatMap(
  sourceExpr: string,
  itemBinding: string,
  arms: ExpandArm[],
  scope: EmitExprScope
): string {
  const branches = arms.map((arm) => {
    const construction = emitConstruction(arm.target, scope);
    if (arm.when !== null) {
      return `if (${emitExpr(arm.when, scope)}) return [${construction}];`;
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
function emitManyExpr(expansion: Expansion, scope: EmitExprScope): string {
  const comprehension = expansion.comprehension;
  if (comprehension === null) {
    throw new Error("emitStrategies: many expansion missing comprehension");
  }

  const { itemBinding, source, arms } = comprehension;
  const sourceExpr = emitExpr(source, scope);
  if (arms.length === 1) {
    return emitArmManyExpr(sourceExpr, itemBinding, arms[0]!, scope);
  }
  return emitMultiArmFlatMap(sourceExpr, itemBinding, arms, scope);
}

function emitExpansionContribution(expansion: Expansion, scope: EmitExprScope): string {
  if (expansion.multiplicity === "one" || expansion.comprehension === null) {
    if (expansion.target === null) {
      throw new Error("emitStrategies: one-expand missing target");
    }
    return emitConstruction(expansion.target, scope);
  }

  return `...${emitManyExpr(expansion, scope)}`;
}

function emitResourcesArray(expansions: Expansion[], scope: EmitExprScope): string {
  if (expansions.length === 1) {
    const only = expansions[0]!;
    // A lone `many` already yields an array — avoid `[...xs.map(...)]`.
    if (only.multiplicity === "many" && only.comprehension !== null) {
      return emitManyExpr(only, scope);
    }
    if (only.target === null) {
      throw new Error("emitStrategies: one-expand missing target");
    }
    return `[${emitConstruction(only.target, scope)}]`;
  }

  const parts = expansions.map((e) => emitExpansionContribution(e, scope));
  return `[\n        ${parts.join(",\n        ")},\n      ]`;
}

function emitFlatProjectionExpansion(projection: ResourceProjection): string {
  const ari = ariFactoryName(projection.resource);
  const resources = emitResourcesArray(projection.expansions, strategyExprScope);

  return [
    `  strategy.expansion`,
    `    .on(${ari})`,
    `    .expand((predicate) => ({`,
    `      resources: ${resources},`,
    `    }));`,
  ].join("\n");
}

function emitArmedProjectionExpansion(projection: ResourceProjection, arm: ProjectionArm): string {
  const ari = ariFactoryName(projection.resource);
  const resources = emitResourcesArray(arm.expansions, strategyArmedBodyScope);
  const whenPred = emitExpr(arm.when, strategyExprScope);

  // `.when()` is a runtime filter; TypeScript still sees the full payload union.
  // Cast so arm-specific fields (imageId, tabs, …) typecheck in the expand body.
  return [
    `  strategy.expansion`,
    `    .on(${ari})`,
    `    .when((predicate) => ${whenPred})`,
    `    .expand((predicate) => {`,
    `      const payload = predicate.payload as any;`,
    `      return {`,
    `        resources: ${resources},`,
    `      };`,
    `    });`,
  ].join("\n");
}

/**
 * Expansion policy blocks for one `on` projection.
 * Armed projections contribute one policy per arm that has expansions;
 * arms with fields only (no expand) are omitted from the strategy.
 * Resolve-only projections contribute no expansions.
 */
export function emitProjectionExpansions(projection: ResourceProjection): string[] {
  if (projection.resolveArms !== null) {
    return [];
  }
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
  if (projection.resolveArms !== null) {
    return [];
  }
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
 * else `predicate.executionContext.<name>` when the query declares that context field.
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
      return `${field.name}: predicate.executionContext.${field.name}`;
    }
    return `${field.name}: item.${field.name}`;
  });

  return [
    `  strategy.expansion`,
    `    .on(${collectionAri})`,
    `    .expand((predicate) => ({`,
    `      resources: predicate.payload.map((item: any) => ${elementAri}({ ${argParts.join(", ")} })),`,
    `    }));`,
  ].join("\n");
}

export function collectCollectionFanOuts(
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
