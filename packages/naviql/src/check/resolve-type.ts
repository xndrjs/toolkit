/**
 * Resolve `typeProjection` (`Resource.field`) to the payload field's semantic type.
 * Projections are kept in IR through lowering; resolution is a checker concern.
 */
import type { SourceSpan, TypeExpr } from "../ir";
import { formatType, typesSemanticallyEqual } from "./assignability";
import type { DiagnosticSink } from "./diagnostic";
import type { ResourceTable, ScalarTable } from "./symbols";

function unwrapNullable(type: TypeExpr): TypeExpr {
  return type.kind === "nullable" ? unwrapNullable(type.of) : type;
}
export function resolveTypeExpr(
  type: TypeExpr,
  path: string,
  scalars: ScalarTable,
  resources: ResourceTable,
  sink: DiagnosticSink,
  visiting = new Set<string>()
): TypeExpr | undefined {
  switch (type.kind) {
    case "primitive":
    case "scalarRef":
    case "resourceRef":
    case "stringLiteral":
      return type;
    case "nullable": {
      const of = resolveTypeExpr(type.of, path, scalars, resources, sink, visiting);
      return of ? { kind: "nullable", of, span: type.span } : undefined;
    }
    case "array": {
      const of = resolveTypeExpr(type.of, path, scalars, resources, sink, visiting);
      return of ? { kind: "array", of, span: type.span } : undefined;
    }
    case "object": {
      const fields = [];
      for (const field of type.fields) {
        const fieldType = resolveTypeExpr(
          field.type,
          `${path}.${field.name}`,
          scalars,
          resources,
          sink,
          visiting
        );
        if (!fieldType) return undefined;
        fields.push({ ...field, type: fieldType });
      }
      return { kind: "object", fields, span: type.span };
    }
    case "union": {
      const members: TypeExpr[] = [];
      for (let i = 0; i < type.members.length; i++) {
        const member = resolveTypeExpr(
          type.members[i]!,
          `${path}|${i}`,
          scalars,
          resources,
          sink,
          visiting
        );
        if (!member) return undefined;
        if (member.kind === "union") members.push(...member.members);
        else members.push(member);
      }
      return normalizeUnion(members, type.span);
    }
    case "typeProjection":
      return resolveTypeProjection(type, path, scalars, resources, sink, visiting);
  }
}

function resolveTypeProjection(
  type: Extract<TypeExpr, { kind: "typeProjection" }>,
  path: string,
  scalars: ScalarTable,
  resources: ResourceTable,
  sink: DiagnosticSink,
  visiting: Set<string>
): TypeExpr | undefined {
  const key = `${type.resource}.${type.field}`;
  if (visiting.has(key)) {
    sink.push({
      code: "TYPE_PROJECTION_CYCLE",
      message: `Cyclic type projection involving '${key}'`,
      path,
      span: type.span,
    });
    return undefined;
  }
  visiting.add(key);

  const resource = resources.get(type.resource);
  if (!resource) {
    sink.push({
      code: "UNKNOWN_RESOURCE",
      message: `Unknown resource '${type.resource}' in type projection '${key}'`,
      path,
      span: type.span,
    });
    visiting.delete(key);
    return undefined;
  }

  const projected = projectPayloadField(
    resource.payloadType,
    type.field,
    type.resource,
    key,
    path,
    type.span,
    resources,
    sink
  );
  visiting.delete(key);
  if (!projected) return undefined;

  return resolveTypeExpr(projected, path, scalars, resources, sink, visiting);
}

/**
 * Project `field` from a payload type. Resource-union payloads distribute;
 * the field must exist on every member (common-field rule).
 */
function projectPayloadField(
  payloadType: TypeExpr,
  field: string,
  ownerLabel: string,
  projectionLabel: string,
  path: string,
  span: SourceSpan | null,
  resources: ResourceTable,
  sink: DiagnosticSink
): TypeExpr | undefined {
  const payload = unwrapNullable(payloadType);

  if (payload.kind === "object") {
    const decl = payload.fields.find((f) => f.name === field);
    if (!decl) {
      sink.push({
        code: "UNKNOWN_PAYLOAD_FIELD_PROJECTION",
        message: `Unknown payload field '${field}' on '${ownerLabel}'`,
        path,
        span,
      });
      return undefined;
    }
    return decl.type;
  }

  if (payload.kind === "resourceRef") {
    const inner = resources.get(payload.name);
    if (!inner) {
      sink.push({
        code: "UNKNOWN_RESOURCE",
        message: `Unknown resource '${payload.name}' while projecting '${projectionLabel}'`,
        path,
        span,
      });
      return undefined;
    }
    return projectPayloadField(
      inner.payloadType,
      field,
      payload.name,
      projectionLabel,
      path,
      span,
      resources,
      sink
    );
  }

  if (payload.kind === "union") {
    const members = flattenUnionMembers(payload);
    const projected: TypeExpr[] = [];
    const missing: string[] = [];

    for (const member of members) {
      if (member.kind === "resourceRef") {
        const inner = resources.get(member.name);
        if (!inner) {
          sink.push({
            code: "UNKNOWN_RESOURCE",
            message: `Unknown resource '${member.name}' while projecting '${projectionLabel}'`,
            path,
            span,
          });
          return undefined;
        }
        const objectPayload = unwrapNullable(inner.payloadType);
        if (objectPayload.kind !== "object") {
          sink.push({
            code: "INVALID_TYPE_PROJECTION",
            message: `Cannot project '${field}' from '${member.name}': payload is not an object (${formatType(inner.payloadType)})`,
            path,
            span,
          });
          return undefined;
        }
        const decl = objectPayload.fields.find((f) => f.name === field);
        if (!decl) missing.push(member.name);
        else projected.push(decl.type);
        continue;
      }

      if (member.kind === "object") {
        const decl = member.fields.find((f) => f.name === field);
        if (!decl) missing.push(formatType(member));
        else projected.push(decl.type);
        continue;
      }

      sink.push({
        code: "INVALID_TYPE_PROJECTION",
        message: `Cannot project '${field}' from '${ownerLabel}': unsupported union member ${formatType(member)}`,
        path,
        span,
      });
      return undefined;
    }

    if (missing.length > 0) {
      sink.push({
        code: "TYPE_PROJECTION_FIELD_NOT_COMMON",
        message: `Cannot project \`${field}\` from \`${ownerLabel}\`: field \`${field}\` is not present on ${missing.join(", ")}.`,
        path,
        span,
      });
      return undefined;
    }

    return normalizeUnion(projected, null);
  }

  sink.push({
    code: "INVALID_TYPE_PROJECTION",
    message: `Cannot project '${field}' from '${ownerLabel}': payload type ${formatType(payloadType)} does not expose fields`,
    path,
    span,
  });
  return undefined;
}

function flattenUnionMembers(type: TypeExpr): TypeExpr[] {
  if (type.kind !== "union") return [type];
  return type.members.flatMap((m) => (m.kind === "union" ? flattenUnionMembers(m) : [m]));
}

function normalizeUnion(members: TypeExpr[], span: TypeExpr["span"]): TypeExpr {
  const unique: TypeExpr[] = [];
  for (const member of members) {
    if (member.kind === "union") {
      for (const nested of member.members) {
        if (!unique.some((u) => typesSemanticallyEqual(u, nested))) unique.push(nested);
      }
    } else if (!unique.some((u) => typesSemanticallyEqual(u, member))) {
      unique.push(member);
    }
  }
  if (unique.length === 1) return unique[0]!;
  return { kind: "union", members: unique, span };
}
