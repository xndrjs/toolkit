import type { ResourceConstruction } from "../ir";
import type { DiagnosticSink } from "./diagnostic";
import { checkExprAssignableTo, inferExprType } from "./expressions";
import type { OpaqueTable, QueryScope, ResourceTable, ScalarTable } from "./symbols";

export function checkConstruction(
  construction: ResourceConstruction,
  path: string,
  scope: QueryScope,
  scalars: ScalarTable,
  resources: ResourceTable,
  opaques: OpaqueTable,
  sink: DiagnosticSink
): void {
  const resource = resources.get(construction.resource);
  if (!resource) {
    sink.push({
      code: "UNKNOWN_RESOURCE",
      message: `Unknown resource '${construction.resource}'`,
      path,
      span: construction.span,
    });
    for (const arg of construction.args) {
      inferExprType(arg.value, `${path}.args.${arg.name}`, scope, resources, sink, scalars);
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
        span: arg.span,
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
        span: arg.span,
      });
      inferExprType(arg.value, argPath, scope, resources, sink, scalars);
      continue;
    }

    checkExprAssignableTo(
      arg.value,
      identityField.type,
      argPath,
      scope,
      scalars,
      resources,
      opaques,
      sink
    );
  }

  for (const [fieldName] of resource.identity) {
    if (!seenArgs.has(fieldName)) {
      sink.push({
        code: "MISSING_CONSTRUCTOR_ARG",
        message: `Missing required identity argument '${fieldName}' for resource '${construction.resource}'`,
        path,
        span: construction.span,
      });
    }
  }
}
