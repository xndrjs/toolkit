/**
 * Expansion policy emit helpers for open `createGraphResolutionStrategy` builders.
 * Armed `on` projections emit one `.on(ari).when(…).expand(…)` per arm that
 * expands; flat `on` stays `.on(ari).expand(…)`.
 * Many-resolve (`resolve to each`) is expansion-backed: same `.on(ari).expand(…)`
 * shape as flat `each` — no `.resolve.to` / redirects map.
 * `on failure` policies are emitted as `ExpansionResult.onFailure` (uniform) or
 * `onFailureByKey` when edges in the same expand disagree.
 */
import type { ExpandArm, Expansion, OnFailurePolicy, ResourceProjection } from "../../../ir";
import type { PlannedProjectionArm, ProjectionPlan } from "../../../analyze";
import {
  emitConstruction,
  emitExpr,
  strategyArmedBodyScope,
  strategyExprScope,
  type EmitExprScope,
} from "../shared";
import { ariFactoryName } from "../naming";
import { printTypeExpr } from "../resources";

function emitArmManyExpr(
  sourceExpr: string,
  itemBinding: string,
  arm: ExpandArm,
  scope: EmitExprScope
): string {
  const construction = emitConstruction(arm.target, scope);
  const mapFn = `(${itemBinding}) => ${construction}`;
  if (arm.when !== null) {
    return `${sourceExpr}.filter((${itemBinding}) => ${emitExpr(arm.when, scope)}).map(${mapFn})`;
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
  return `${sourceExpr}.flatMap((${itemBinding}) => {\n          ${body}\n        })`;
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

/** Collect every per-edge policy contributed by these expansions. */
function collectOnFailurePolicies(expansions: Expansion[]): OnFailurePolicy[] {
  const policies: OnFailurePolicy[] = [];
  for (const expansion of expansions) {
    if (expansion.multiplicity === "one") {
      policies.push(expansion.onFailure);
      continue;
    }
    if (expansion.comprehension === null) continue;
    for (const arm of expansion.comprehension.arms) {
      policies.push(arm.onFailure);
    }
  }
  return policies;
}

/**
 * Shared policy when every edge agrees; otherwise `null` (emit `onFailureByKey`).
 */
function uniformOnFailure(expansions: Expansion[]): OnFailurePolicy | null {
  const policies = collectOnFailurePolicies(expansions);
  if (policies.length === 0) return "throw";
  const first = policies[0]!;
  return policies.every((p) => p === first) ? first : null;
}

function emitManyPushStmts(expansion: Expansion, scope: EmitExprScope, index: number): string[] {
  const comprehension = expansion.comprehension;
  if (comprehension === null) {
    throw new Error("emitStrategies: many expansion missing comprehension");
  }

  const { itemBinding, source, arms } = comprehension;
  const sourceExpr = emitExpr(source, scope);
  const stmts: string[] = [];

  if (arms.length === 1) {
    const arm = arms[0]!;
    const listVar = `__many${index}`;
    const construction = emitConstruction(arm.target, scope);
    const listExpr =
      arm.when !== null
        ? `${sourceExpr}.filter((${itemBinding}) => ${emitExpr(arm.when, scope)}).map((${itemBinding}) => ${construction})`
        : `${sourceExpr}.map((${itemBinding}) => ${construction})`;
    stmts.push(`const ${listVar} = ${listExpr};`);
    stmts.push(`for (const __item of ${listVar}) {`);
    stmts.push(`  __resources.push(__item);`);
    stmts.push(`  __onFailureByKey.set(__item.toString(), ${JSON.stringify(arm.onFailure)});`);
    stmts.push(`}`);
    return stmts;
  }

  const policyVar = `__policy${index}`;
  stmts.push(`for (const ${itemBinding} of ${sourceExpr}) {`);
  for (const arm of arms) {
    const construction = emitConstruction(arm.target, scope);
    if (arm.when !== null) {
      stmts.push(`  if (${emitExpr(arm.when, scope)}) {`);
      stmts.push(`    const ${policyVar} = ${construction};`);
      stmts.push(`    __resources.push(${policyVar});`);
      stmts.push(
        `    __onFailureByKey.set(${policyVar}.toString(), ${JSON.stringify(arm.onFailure)});`
      );
      stmts.push(`    continue;`);
      stmts.push(`  }`);
    } else {
      stmts.push(`  {`);
      stmts.push(`    const ${policyVar} = ${construction};`);
      stmts.push(`    __resources.push(${policyVar});`);
      stmts.push(
        `    __onFailureByKey.set(${policyVar}.toString(), ${JSON.stringify(arm.onFailure)});`
      );
      stmts.push(`    continue;`);
      stmts.push(`  }`);
    }
  }
  stmts.push(`}`);
  return stmts;
}

/**
 * Mixed per-edge policies: build `resources` + `onFailureByKey` imperatively so
 * many-expand source order is preserved.
 */
function emitMixedExpandBody(expansions: Expansion[], scope: EmitExprScope): string {
  const stmts: string[] = [
    `const __resources: ApplicationResourceIdentifier[] = [];`,
    `const __onFailureByKey = new Map<string, "throw" | "setNull" | "setError">();`,
  ];

  for (let i = 0; i < expansions.length; i++) {
    const expansion = expansions[i]!;
    if (expansion.multiplicity === "one") {
      if (expansion.target === null) {
        throw new Error("emitStrategies: one-expand missing target");
      }
      const varName = `__r${i}`;
      stmts.push(`const ${varName} = ${emitConstruction(expansion.target, scope)};`);
      stmts.push(`__resources.push(${varName});`);
      stmts.push(
        `__onFailureByKey.set(${varName}.toString(), ${JSON.stringify(expansion.onFailure)});`
      );
      continue;
    }
    stmts.push(...emitManyPushStmts(expansion, scope, i));
  }

  stmts.push(`return { resources: __resources, onFailureByKey: __onFailureByKey };`);
  return stmts.join("\n      ");
}

function emitOnFailureField(onFailure: OnFailurePolicy, indent: string): string[] {
  if (onFailure === "throw") return [];
  return [`${indent}onFailure: ${JSON.stringify(onFailure)},`];
}

function emitFlatProjectionExpansion(projection: ResourceProjection): string {
  const ari = ariFactoryName(projection.resource);
  const uniform = uniformOnFailure(projection.expansions);

  if (uniform === null) {
    return [
      `  strategy.expansion`,
      `    .on(${ari})`,
      `    .expand((predicate) => {`,
      `      ${emitMixedExpandBody(projection.expansions, strategyExprScope)}`,
      `    });`,
    ].join("\n");
  }

  const resources = emitResourcesArray(projection.expansions, strategyExprScope);
  return [
    `  strategy.expansion`,
    `    .on(${ari})`,
    `    .expand((predicate) => ({`,
    `      resources: ${resources},`,
    ...emitOnFailureField(uniform, "      "),
    `    }));`,
  ].join("\n");
}

function emitConditionalProjectionExpansion(
  projection: ResourceProjection,
  whenPred: string,
  expansions: Expansion[],
  payloadType: string
): string {
  const ari = ariFactoryName(projection.resource);
  const uniform = uniformOnFailure(expansions);

  // `.when()` is a runtime filter; TypeScript still sees the full payload union.
  // Cast so arm-specific fields (imageId, tabs, …) typecheck in the expand body.
  if (uniform === null) {
    return [
      `  strategy.expansion`,
      `    .on(${ari})`,
      `    .when((predicate) => ${whenPred})`,
      `    .expand((predicate) => {`,
      `      const payload = predicate.payload as ${payloadType};`,
      `      ${emitMixedExpandBody(expansions, strategyArmedBodyScope)}`,
      `    });`,
    ].join("\n");
  }

  const resources = emitResourcesArray(expansions, strategyArmedBodyScope);
  return [
    `  strategy.expansion`,
    `    .on(${ari})`,
    `    .when((predicate) => ${whenPred})`,
    `    .expand((predicate) => {`,
    `      const payload = predicate.payload as ${payloadType};`,
    `      return {`,
    `        resources: ${resources},`,
    ...emitOnFailureField(uniform, "        "),
    `      };`,
    `    });`,
  ].join("\n");
}

function firstMatchPredicate(plan: ProjectionPlan, arm: PlannedProjectionArm): string {
  const projection = plan.source;
  const current = emitExpr(arm.source.when, strategyExprScope);
  if (arm.index === 0) return current;
  const previous = projection
    .arms!.slice(0, arm.index)
    .map((candidate) => `!(${emitExpr(candidate.when, strategyExprScope)})`);
  return `${previous.join(" && ")} && (${current})`;
}

function emitArmedProjectionExpansion(plan: ProjectionPlan, arm: PlannedProjectionArm): string {
  return emitConditionalProjectionExpansion(
    plan.source,
    firstMatchPredicate(plan, arm),
    arm.source.expansions,
    printTypeExpr(arm.payloadType)
  );
}

function emitDefaultProjectionExpansion(plan: ProjectionPlan): string | null {
  const projection = plan.source;
  const defaultArm = plan.defaultArm;
  if (defaultArm === null || !defaultArm.reachable || defaultArm.source.expansions.length === 0) {
    return null;
  }
  const whenPred = projection
    .arms!.map((arm) => `!(${emitExpr(arm.when, strategyExprScope)})`)
    .join(" && ");
  return emitConditionalProjectionExpansion(
    projection,
    whenPred,
    defaultArm.source.expansions,
    printTypeExpr(defaultArm.payloadType)
  );
}

/** Synthetic many-expand so resolve-to-each reuses emitMany / onFailure helpers. */
/**
 * Expansion policy blocks for one `on` projection.
 * Armed projections contribute one policy per arm that has expansions;
 * arms with fields only (no expand) are omitted from the strategy.
 * 1→1 resolve-only (`resolveArms`) contributes no expansions (see
 * {@link emitProjectionResolves}); many-resolve (`resolveEach`) emits one
 * expansion-backed `.on(ari).expand(…)` using the each body.
 */
export function emitProjectionExpansions(plan: ProjectionPlan): string[] {
  const projection = plan.source;
  if (projection.resolveArms !== null) {
    return [];
  }
  if (projection.resolveEach !== null) {
    if (plan.resolveEach === null) {
      throw new Error("emitStrategies: missing planned resolve-each expansion");
    }
    return [emitFlatProjectionExpansion({ ...projection, expansions: [plan.resolveEach.source] })];
  }
  if (projection.arms !== null) {
    const arms = plan.arms
      .filter((arm) => arm.reachable && arm.source.expansions.length > 0)
      .map((arm) => emitArmedProjectionExpansion(plan, arm));
    const defaultExpansion = emitDefaultProjectionExpansion(plan);
    return defaultExpansion === null ? arms : [...arms, defaultExpansion];
  }
  if (projection.expansions.length === 0) {
    return [];
  }
  return [emitFlatProjectionExpansion(projection)];
}
