/**
 * Island policy emit: `strategy.islands.on(ari)[.when(…)].startIsland()`.
 * `when: null` ⇒ unconditional startIsland (one policy per clause).
 */
import type { IslandClause } from "../../../ir";
import { emitExpr, strategyExprScope } from "../shared";
import { ariFactoryName } from "../naming";

function emitUnconditionalIsland(ari: string): string {
  return [`  strategy.islands`, `    .on(${ari})`, `    .startIsland();`].join("\n");
}

function emitConditionalIsland(ari: string, whenPred: string): string {
  return [
    `  strategy.islands`,
    `    .on(${ari})`,
    `    .when((predicate) => ${whenPred})`,
    `    .startIsland();`,
  ].join("\n");
}

/** Island policy block for one `on Resource [binding] [when …]` clause. */
export function emitIslandClause(clause: IslandClause): string[] {
  const ari = ariFactoryName(clause.resource);

  if (clause.when === null) {
    return [emitUnconditionalIsland(ari)];
  }

  return [emitConditionalIsland(ari, emitExpr(clause.when, strategyExprScope))];
}

/** All island policy blocks for a query's `islands { … }` clauses. */
export function emitIslands(islands: IslandClause[]): string[] {
  return islands.flatMap(emitIslandClause);
}
