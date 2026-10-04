import type { SourceSpan, TypeExpr } from "../ir";
import { formatType } from "./assignability";
import type { DiagnosticSink } from "./diagnostic";
import { unwrapNullable, type FieldMap, type QueryScope, type ResourceTable } from "./symbols";

export function resolveBindingPath(
  binding: string,
  pathSegments: string[],
  side: "payload" | "identity",
  path: string,
  span: SourceSpan | null,
  scope: QueryScope,
  resources: ResourceTable,
  sink: DiagnosticSink
): TypeExpr | undefined {
  const resourceName = scope.bindings.get(binding);
  if (!resourceName) {
    sink.push({
      code: "UNKNOWN_BINDING",
      message: `Unknown binding '${binding}'`,
      path,
      span,
    });
    return undefined;
  }
  const resource = resources.get(resourceName);
  if (!resource) {
    return undefined;
  }

  if (side === "identity") {
    return resolvePathOnFields(
      pathSegments,
      resource.identity,
      path,
      "UNKNOWN_IDENTITY_PATH",
      "identity",
      span,
      sink
    );
  }

  const narrowed = scope.payloadNarrowing.get(binding);
  const payloadType = narrowed ?? resource.payloadType;
  return resolvePathOnPayloadType(pathSegments, payloadType, path, span, resources, sink);
}

/**
 * Resolve a payload path against an object, resourceRef, or union payload,
 * distributing over unions the same way item paths do.
 */
export function resolvePathOnPayloadType(
  pathSegments: string[],
  payloadType: TypeExpr,
  diagPath: string,
  span: SourceSpan | null,
  resources: ResourceTable,
  sink: DiagnosticSink
): TypeExpr | undefined {
  if (pathSegments.length === 0) {
    return payloadType;
  }

  const inner = unwrapNullable(payloadType);

  if (inner.kind === "object") {
    return resolvePathOnFields(
      pathSegments,
      new Map(inner.fields.map((f) => [f.name, f])),
      diagPath,
      "UNKNOWN_PAYLOAD_PATH",
      "payload",
      span,
      sink
    );
  }

  if (inner.kind === "resourceRef") {
    const referenced = resources.get(inner.name);
    if (!referenced) {
      sink.push({
        code: "UNKNOWN_PAYLOAD_PATH",
        message: `Unknown resource '${inner.name}' in payload path`,
        path: diagPath,
        span,
      });
      return undefined;
    }
    return resolvePathOnPayloadType(
      pathSegments,
      referenced.payloadType,
      diagPath,
      span,
      resources,
      sink
    );
  }

  if (inner.kind === "union") {
    const memberTypes: TypeExpr[] = [];
    for (const member of inner.members) {
      const resolved = resolvePathOnPayloadType(
        pathSegments,
        member,
        diagPath,
        span,
        resources,
        sink
      );
      if (!resolved) {
        return undefined;
      }
      memberTypes.push(resolved);
    }
    const unique: TypeExpr[] = [];
    for (const t of memberTypes) {
      if (!unique.some((u) => formatType(u) === formatType(t))) {
        unique.push(t);
      }
    }
    if (unique.length === 1) return unique[0];
    return { kind: "union", members: unique, span: null };
  }

  if (inner.kind === "opaqueRef") {
    sink.push({
      code: "OPAQUE_VALUE_NOT_INSPECTABLE",
      message: `Opaque type '${inner.name}' is not inspectable; cannot access path '${pathSegments.join(".")}'`,
      path: diagPath,
      span,
    });
    return undefined;
  }

  sink.push({
    code: "UNKNOWN_PAYLOAD_PATH",
    message: `Cannot access path on non-object payload type ${formatType(payloadType)}`,
    path: diagPath,
    span,
  });
  return undefined;
}

export function resolvePathOnFields(
  pathSegments: string[],
  rootFields: FieldMap,
  diagPath: string,
  code: string,
  label: string,
  span: SourceSpan | null,
  sink: DiagnosticSink
): TypeExpr | undefined {
  if (pathSegments.length === 0) {
    sink.push({
      code,
      message: `Empty ${label} path`,
      path: diagPath,
      span,
    });
    return undefined;
  }

  let fields: FieldMap | null = rootFields;
  let currentType: TypeExpr | undefined;

  for (let i = 0; i < pathSegments.length; i++) {
    const segment = pathSegments[i]!;
    if (!fields) {
      sink.push({
        code,
        message: `Cannot access '${segment}' on non-object ${label} type${currentType ? ` ${formatType(currentType)}` : ""}`,
        path: diagPath,
        span,
      });
      return undefined;
    }
    const field = fields.get(segment);
    if (!field) {
      sink.push({
        code,
        message: `Unknown ${label} path '${pathSegments.slice(0, i + 1).join(".")}'`,
        path: diagPath,
        span,
      });
      return undefined;
    }
    currentType = field.type;
    if (i < pathSegments.length - 1) {
      const inner = unwrapNullable(currentType);
      if (inner.kind === "object") {
        fields = new Map(inner.fields.map((f) => [f.name, f]));
      } else if (inner.kind === "opaqueRef") {
        sink.push({
          code: "OPAQUE_VALUE_NOT_INSPECTABLE",
          message: `Opaque type '${inner.name}' is not inspectable; cannot access '${pathSegments[i + 1]}'`,
          path: diagPath,
          span,
        });
        return undefined;
      } else {
        fields = null;
      }
    }
  }

  return currentType;
}

/**
 * Resolve a path on an item type, including unions of objects that share the
 * field (discriminated stubs: `{ type: "Hero", id: HeroId } | …`).
 */
export function resolvePathOnItemType(
  pathSegments: string[],
  itemType: TypeExpr,
  diagPath: string,
  span: SourceSpan | null,
  sink: DiagnosticSink
): TypeExpr | undefined {
  const inner = unwrapNullable(itemType);
  if (inner.kind === "object") {
    return resolvePathOnFields(
      pathSegments,
      new Map(inner.fields.map((f) => [f.name, f])),
      diagPath,
      "UNKNOWN_ITEM_PATH",
      "item",
      span,
      sink
    );
  }

  if (inner.kind === "union") {
    const memberTypes: TypeExpr[] = [];
    for (const member of inner.members) {
      const resolved = resolvePathOnItemType(pathSegments, member, diagPath, span, sink);
      if (!resolved) {
        return undefined;
      }
      memberTypes.push(resolved);
    }
    // Collapse identical types; otherwise keep a union (e.g. HeroId | TabsId | ProductId).
    const unique: TypeExpr[] = [];
    for (const t of memberTypes) {
      if (!unique.some((u) => formatType(u) === formatType(t))) {
        unique.push(t);
      }
    }
    if (unique.length === 1) return unique[0];
    return { kind: "union", members: unique, span: null };
  }

  if (inner.kind === "opaqueRef") {
    sink.push({
      code: "OPAQUE_VALUE_NOT_INSPECTABLE",
      message: `Opaque type '${inner.name}' is not inspectable; cannot access path '${pathSegments.join(".")}'`,
      path: diagPath,
      span,
    });
    return undefined;
  }

  sink.push({
    code: "UNKNOWN_ITEM_PATH",
    message: `Cannot access path on non-object item type ${formatType(itemType)}`,
    path: diagPath,
    span,
  });
  return undefined;
}
