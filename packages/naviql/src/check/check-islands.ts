import type { IslandClause } from "../ir";
import { formatType } from "./assignability";
import type { DiagnosticSink } from "./diagnostic";
import { inferExprType } from "./expressions";
import { unwrapNullable, type QueryScope, type ResourceTable } from "./symbols";

/**
 * Validate query `islands { on Resource [binding] [when …] }` clauses.
 * `when: null` ⇒ unconditional startIsland (no further checks beyond resource).
 */
export function checkIslands(
  islands: IslandClause[],
  path: string,
  scope: QueryScope,
  resources: ResourceTable,
  sink: DiagnosticSink
): void {
  for (let i = 0; i < islands.length; i++) {
    const clause = islands[i]!;
    const clausePath = `${path}.islands.${i}`;
    const knownResource = resources.has(clause.resource);

    if (!knownResource) {
      sink.push({
        code: "UNKNOWN_RESOURCE",
        message: `Unknown resource '${clause.resource}' in islands clause`,
        path: clausePath,
        span: clause.span,
      });
    }

    if (clause.when !== null && clause.binding == null) {
      sink.push({
        code: "ISLAND_BINDING_REQUIRED",
        message: `Island clause 'on ${clause.resource}' requires a binding when a when-clause is present`,
        path: clausePath,
        span: clause.span,
      });
      continue;
    }

    if (!knownResource || clause.when === null || clause.binding == null) {
      continue;
    }

    const whenScope: QueryScope = {
      ...scope,
      bindings: new Map([...scope.bindings, [clause.binding, clause.resource]]),
    };

    const whenPath = `${clausePath}.when`;
    const whenType = inferExprType(clause.when, whenPath, whenScope, resources, sink);
    if (!whenType) continue;

    const prim = unwrapNullable(whenType);
    if (prim.kind !== "primitive" || prim.name !== "boolean") {
      sink.push({
        code: "TYPE_MISMATCH",
        message: `Island when-clause must be boolean, got ${formatType(whenType)}`,
        path: whenPath,
        span: clause.when.span,
      });
    }
  }
}
