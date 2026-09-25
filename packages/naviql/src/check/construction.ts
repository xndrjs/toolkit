import type { ResourceConstruction } from "../ir";
import type { DiagnosticSink } from "./diagnostic";
import { checkExprAssignableTo, inferExprType } from "./expressions";
import type { QueryScope, ResourceTable, ScalarTable } from "./symbols";

export function checkConstruction(
  construction: ResourceConstruction,
  path: string,
  scope: QueryScope,
  scalars: ScalarTable,
  resources: ResourceTable,
  sink: DiagnosticSink
): void {
  const resource = resources.get(construction.resource);
  if (!resource) {
    sink.push({
      code: "UNKNOWN_RESOURCE",
      message: `Unknown resource '${construction.resource}'`,
      path,
    });
    for (const arg of construction.args) {
      inferExprType(arg.value, `${path}.args.${arg.name}`, scope, resources, sink);
    }
    return;
  }

  const seenArgs = new Set<string>();
  for (const arg of construction.args) {
    const argPath = `${path}.args.${arg.name}`;
    if (seenArgs.has(arg.name)) {
      sink.push({
        code: "DUPLICATE_CONSTRUCTOR_ARG",
        message: `Duplicate constructor argument '${arg.name}'`,
        path: argPath,
      });
      continue;
    }
    seenArgs.add(arg.name);

    const identityField = resource.identity.get(arg.name);
    if (!identityField) {
      sink.push({
        code: "UNKNOWN_CONSTRUCTOR_ARG",
        message: `Unknown identity argument '${arg.name}' for resource '${construction.resource}'`,
        path: argPath,
      });
      inferExprType(arg.value, argPath, scope, resources, sink);
      continue;
    }

    checkExprAssignableTo(arg.value, identityField.type, argPath, scope, scalars, resources, sink);
  }

  for (const [fieldName] of resource.identity) {
    if (!seenArgs.has(fieldName)) {
      sink.push({
        code: "MISSING_CONSTRUCTOR_ARG",
        message: `Missing required identity argument '${fieldName}' for resource '${construction.resource}'`,
        path,
      });
    }
  }
}
