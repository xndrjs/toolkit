import type { QueryDefinition } from "../ir";
import { checkConstruction } from "./construction";
import type { DiagnosticSink } from "./diagnostic";
import {
  checkTypeExpr,
  checkUniqueFields,
  type QueryScope,
  type ResourceTable,
  type ScalarTable,
} from "./symbols";

export function checkQuery(
  query: QueryDefinition,
  path: string,
  scalars: ScalarTable,
  resources: ResourceTable,
  sink: DiagnosticSink
): void {
  const params = checkUniqueFields(
    query.parameters,
    `${path}.parameters`,
    "DUPLICATE_PARAM",
    "parameter",
    sink
  );
  const context = checkUniqueFields(
    query.context,
    `${path}.context`,
    "DUPLICATE_CONTEXT_FIELD",
    "context",
    sink
  );

  for (const field of query.parameters) {
    checkTypeExpr(field.type, `${path}.parameters.${field.name}`, scalars, sink);
  }
  for (const field of query.context) {
    checkTypeExpr(field.type, `${path}.context.${field.name}`, scalars, sink);
  }

  const bindings = new Map<string, string>();
  for (let i = 0; i < query.projections.length; i++) {
    const projection = query.projections[i]!;
    const projPath = `${path}.projections.${projection.binding || i}`;
    if (bindings.has(projection.binding)) {
      sink.push({
        code: "DUPLICATE_BINDING",
        message: `Duplicate projection binding '${projection.binding}' in query '${query.name}'`,
        path: projPath,
      });
      continue;
    }
    if (!resources.has(projection.resource)) {
      sink.push({
        code: "UNKNOWN_RESOURCE",
        message: `Unknown resource '${projection.resource}' in projection`,
        path: projPath,
      });
    }
    bindings.set(projection.binding, projection.resource);
  }

  const scope: QueryScope = {
    path,
    params,
    context,
    bindings,
  };

  checkConstruction(query.root, `${path}.root`, scope, scalars, resources, sink);

  for (const projection of query.projections) {
    const projPath = `${path}.projections.${projection.binding}`;
    const resource = resources.get(projection.resource);
    if (!resource) {
      continue;
    }

    for (const fieldName of projection.selectedFields) {
      if (!resource.payload.has(fieldName)) {
        sink.push({
          code: "UNKNOWN_SELECTED_FIELD",
          message: `Selected field '${fieldName}' is not on payload of '${projection.resource}'`,
          path: `${projPath}.selectedFields.${fieldName}`,
        });
      }
    }

    const aliases = new Set<string>();
    for (const expansion of projection.expansions) {
      const expPath = `${projPath}.expansions.${expansion.alias}`;
      if (aliases.has(expansion.alias)) {
        sink.push({
          code: "DUPLICATE_EXPANSION_ALIAS",
          message: `Duplicate expansion alias '${expansion.alias}'`,
          path: expPath,
        });
        continue;
      }
      aliases.add(expansion.alias);
      checkConstruction(expansion.target, expPath, scope, scalars, resources, sink);
    }
  }
}
