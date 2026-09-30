/**
 * 1→1 resolve policy emit helpers: `.resolve.on(ari)[.when(…)].to(…)`.
 * Many-resolve (`resolveEach`) is expansion-backed — see
 * {@link emitProjectionExpansions}; redirects map is unused for those locators.
 */
import type { PlannedResolveArm, ProjectionPlan } from "../../../check";
import type { ResourceProjection } from "../../../ir";
import { emitConstruction, emitExpr, strategyArmedBodyScope, strategyExprScope } from "../shared";
import { ariFactoryName } from "../naming";
import { printTypeExpr } from "../resources";

function emitResolveArm(projection: ResourceProjection, arm: PlannedResolveArm): string {
  const ari = ariFactoryName(projection.resource);

  if (arm.source.when !== null) {
    const whenPred = emitExpr(arm.source.when, strategyExprScope);
    const construction = emitConstruction(arm.source.target, strategyArmedBodyScope);
    const payloadType = printTypeExpr(arm.payloadType);
    return [
      `  strategy.resolve`,
      `    .on(${ari})`,
      `    .when((predicate) => ${whenPred})`,
      `    .to((predicate) => {`,
      `      const payload = predicate.payload as ${payloadType};`,
      `      return {`,
      `        resource: ${construction},`,
      `      };`,
      `    });`,
    ].join("\n");
  }

  const construction = emitConstruction(arm.source.target, strategyExprScope);
  return [
    `  strategy.resolve`,
    `    .on(${ari})`,
    `    .to((predicate) => ({`,
    `      resource: ${construction},`,
    `    }));`,
  ].join("\n");
}

/**
 * 1→1 resolve policy blocks for one resolve-only `on` projection.
 * Skips `resolveEach` (handled as expansion).
 */
export function emitProjectionResolves(plan: ProjectionPlan): string[] {
  const projection = plan.source;
  if (projection.resolveArms === null) {
    return [];
  }
  return plan.resolveArms
    .filter((arm) => arm.reachable)
    .map((arm) => emitResolveArm(projection, arm));
}
