import type { FieldDecl, ScalarDefinition, TypeExpr } from "../ir";
import type { DiagnosticSink } from "./diagnostic";

export type FieldMap = Map<string, FieldDecl>;

export type ResourceSymbols = {
  identity: FieldMap;
  payload: FieldMap;
};

export type QueryScope = {
  path: string;
  params: FieldMap;
  context: FieldMap;
  /** Projection binding → resource name */
  bindings: Map<string, string>;
};

export type ScalarTable = Map<string, ScalarDefinition>;
export type ResourceTable = Map<string, ResourceSymbols>;

export function checkUniqueFields(
  fields: FieldDecl[],
  basePath: string,
  code: string,
  label: string,
  sink: DiagnosticSink
): FieldMap {
  const map: FieldMap = new Map();
  for (const field of fields) {
    if (map.has(field.name)) {
      sink.push({
        code,
        message: `Duplicate ${label} field '${field.name}'`,
        path: `${basePath}.${field.name}`,
      });
      continue;
    }
    map.set(field.name, field);
  }
  return map;
}

export function checkTypeExpr(
  type: TypeExpr,
  path: string,
  scalars: ScalarTable,
  sink: DiagnosticSink
): void {
  switch (type.kind) {
    case "primitive":
    case "stringLiteral":
      return;
    case "scalarRef":
      if (!scalars.has(type.name)) {
        sink.push({
          code: "UNKNOWN_SCALAR",
          message: `Unknown scalar '${type.name}'`,
          path,
        });
      }
      return;
    case "nullable":
    case "array":
      checkTypeExpr(type.of, path, scalars, sink);
      return;
    case "object":
      for (const field of type.fields) {
        checkTypeExpr(field.type, `${path}.${field.name}`, scalars, sink);
      }
      return;
    case "union":
      for (let i = 0; i < type.members.length; i++) {
        checkTypeExpr(type.members[i]!, `${path}|${i}`, scalars, sink);
      }
      return;
  }
}

export function unwrapNullable(type: TypeExpr): TypeExpr {
  return type.kind === "nullable" ? unwrapNullable(type.of) : type;
}
