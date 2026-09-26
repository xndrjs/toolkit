import type { IslandClause } from "../ir";
import { formatType } from "./assignability";
import type { DiagnosticSink } from "./diagnostic";
import { inferExprType } from "./expressions";
import { unwrapNullable, type QueryScope, type ResourceTable } from "./symbols";

/**
 * Validate query `islands { on Resource [binding] { when … }* }` clauses.
 * Empty whens ⇒ unconditional startIsland (no further checks beyond resource).
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

    if (clause.whens.length > 0 && clause.binding == null) {
      sink.push({
        code: "ISLAND_BINDING_REQUIRED",
        message: `Island clause 'on ${clause.resource}' requires a binding when when-clauses are present`,
        path: clausePath,
        span: clause.span,
      });
      continue;
    }

    if (!knownResource || clause.whens.length === 0 || clause.binding == null) {
      continue;
    }

    const whenScope: QueryScope = {
      ...scope,
      bindings: new Map([...scope.bindings, [clause.binding, clause.resource]]),
    };

    for (let j = 0; j < clause.whens.length; j++) {
      const when = clause.whens[j]!;
      const whenPath = `${clausePath}.whens.${j}`;
      const whenType = inferExprType(when, whenPath, whenScope, resources, sink);
      if (!whenType) continue;

      const prim = unwrapNullable(whenType);
      if (prim.kind !== "primitive" || prim.name !== "boolean") {
        sink.push({
          code: "TYPE_MISMATCH",
          message: `Island when-clause must be boolean, got ${formatType(whenType)}`,
          path: whenPath,
          span: when.span,
        });
      }
    }
  }
}
