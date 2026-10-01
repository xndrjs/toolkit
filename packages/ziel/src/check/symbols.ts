import type { FieldDecl, ScalarDefinition, TypeExpr } from "../ir";
import type { DiagnosticSink } from "./diagnostic";
import { resolveTypeExpr } from "./resolve-type";

export type FieldMap = Map<string, FieldDecl>;

export type ResourceSymbols = {
  identity: FieldMap;
  /**
   * Payload fields for lookup: object fields, or the intersection across closed
   * object-union members. Empty when `payloadType` is not an expandable object union.
   */
  payload: FieldMap;
  payloadType: TypeExpr;
};

export type QueryScope = {
  path: string;
  params: FieldMap;
  context: FieldMap;
  /**
   * When false (query / fragment / island bodies), `context.*` is rejected —
   * use bare params. Datasource `when` keeps this true.
   */
  allowContext: boolean;
  /** Projection binding → resource name */
  bindings: Map<string, string>;
  /** Comprehension item binding → element type (narrowed by filter when possible) */
  items: Map<string, TypeExpr>;
  /**
   * Projection binding → narrowed payload type (set while checking `when` arms).
   * When absent, payload refs resolve against the resource's declared payload.
   */
  payloadNarrowing: Map<string, TypeExpr>;
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
        span: field.span,
      });
      continue;
    }
    map.set(field.name, field);
  }
  return map;
}

/**
 * Validate a type expression. Resolves `typeProjection` for diagnostics but
 * does not rewrite the IR node.
 */
export function checkTypeExpr(
  type: TypeExpr,
  path: string,
  scalars: ScalarTable,
  resources: ResourceTable,
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
          span: type.span,
        });
      }
      return;
    case "resourceRef":
      if (!resources.has(type.name)) {
        sink.push({
          code: "UNKNOWN_RESOURCE",
          message: `Unknown resource '${type.name}'`,
          path,
          span: type.span,
        });
      }
      return;
    case "typeProjection":
      // Validate by resolving; keep IR as typeProjection.
      resolveTypeExpr(type, path, scalars, resources, sink);
      return;
    case "null":
      sink.push({
        code: "INVALID_NULL_TYPE",
        message: "`null` is not a standalone type; use `T | null`",
        path,
        span: type.span,
      });
      return;
    case "nullable":
    case "array":
      checkTypeExpr(type.of, path, scalars, resources, sink);
      return;
    case "object":
      for (const field of type.fields) {
        checkTypeExpr(field.type, `${path}.${field.name}`, scalars, resources, sink);
      }
      return;
    case "union":
      for (let i = 0; i < type.members.length; i++) {
        checkTypeExpr(type.members[i]!, `${path}|${i}`, scalars, resources, sink);
      }
      return;
  }
}

export function unwrapNullable(type: TypeExpr): TypeExpr {
  return type.kind === "nullable" ? unwrapNullable(type.of) : type;
}

/** Resolve projections then return a concrete type for assignability / inference. */
export function concreteType(
  type: TypeExpr,
  path: string,
  scalars: ScalarTable,
  resources: ResourceTable,
  sink: DiagnosticSink
): TypeExpr | undefined {
  return resolveTypeExpr(type, path, scalars, resources, sink);
}
