/**
 * 1→1 resolve policy emit helpers: `.resolve.on(ari)[.when(…)].to(…)`.
 * Many-resolve (`resolveEach`) is expansion-backed — see
 * {@link emitProjectionExpansions}; redirects map is unused for those locators.
 */
import type { ResolveArm, ResourceProjection } from "../../../ir";
import { emitConstruction, emitExpr, strategyArmedBodyScope, strategyExprScope } from "../shared";
import { ariFactoryName } from "../naming";

function emitResolveArm(projection: ResourceProjection, arm: ResolveArm): string {
  const ari = ariFactoryName(projection.resource);

  if (arm.when !== null) {
    const whenPred = emitExpr(arm.when, strategyExprScope);
    const construction = emitConstruction(arm.target, strategyArmedBodyScope);
    // Same cast as armed expands: `.when()` is a runtime filter only.
    return [
      `  strategy.resolve`,
      `    .on(${ari})`,
      `    .when((predicate) => ${whenPred})`,
      `    .to((predicate) => {`,
      `      const payload = predicate.payload as any;`,
      `      return {`,
      `        resource: ${construction},`,
      `      };`,
      `    });`,
    ].join("\n");
  }

  const construction = emitConstruction(arm.target, strategyExprScope);
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
export function emitProjectionResolves(projection: ResourceProjection): string[] {
  if (projection.resolveArms === null) {
    return [];
  }
  return projection.resolveArms.map((arm) => emitResolveArm(projection, arm));
}
