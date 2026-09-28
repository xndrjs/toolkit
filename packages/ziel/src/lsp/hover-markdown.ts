/**
 * Pure hover markdown builders for Ziel IntelliSense.
 * Providers resolve AST context, then call these with IR / check tables.
 */
import { formatType } from "../check/assignability";
import { createDiagnosticSink } from "../check/diagnostic";
import { resolvePathOnPayloadType } from "../check/expr-paths";
import type { ResourceSymbols, ResourceTable, ScalarTable } from "../check/symbols";
import type { FieldDecl, TypeExpr } from "../ir";

/** Wrap a Ziel signature in a fenced code block for LSP markdown hover. */
export function hoverCodeBlock(signature: string): string {
  return `\`\`\`ziel\n${signature}\n\`\`\``;
}

export function formatScalarSignature(name: string, representation: string): string {
  return `scalar ${name} on ${representation}`;
}

/** `resource Name(id: T, …): Payload` — identity + formatType(payload). */
export function formatResourceSignature(name: string, symbols: ResourceSymbols): string {
  const identity = [...symbols.identity.values()]
    .map((field) => `${field.name}: ${formatType(field.type)}`)
    .join(", ");
  return `resource ${name}(${identity}): ${formatType(symbols.payloadType)}`;
}

export function formatFieldSignature(name: string, type: TypeExpr, optional = false): string {
  return `${name}${optional ? "?" : ""}: ${formatType(type)}`;
}

/** `fragment Name on Resource: { field: Type, … }` — projected payload shape. */
export function formatFragmentSignature(
  name: string,
  resource: string,
  projectedType: TypeExpr
): string {
  return `fragment ${name} on ${resource}: ${formatType(projectedType)}`;
}

export function scalarHoverMarkdown(name: string, representation: string): string {
  return hoverCodeBlock(formatScalarSignature(name, representation));
}

export function resourceHoverMarkdown(name: string, symbols: ResourceSymbols): string {
  return hoverCodeBlock(formatResourceSignature(name, symbols));
}

export function fieldHoverMarkdown(name: string, type: TypeExpr, optional = false): string {
  return hoverCodeBlock(formatFieldSignature(name, type, optional));
}

export function fragmentHoverMarkdown(
  name: string,
  resource: string,
  projectedType: TypeExpr
): string {
  return hoverCodeBlock(formatFragmentSignature(name, resource, projectedType));
}

/**
 * Resolve a bare type / resource name against workspace tables.
 * Scalars win only when present; otherwise resources; else undefined.
 */
export function namedTypeHoverMarkdown(
  name: string,
  scalars: ScalarTable,
  resources: ResourceTable
): string | undefined {
  const scalar = scalars.get(name);
  if (scalar) {
    return scalarHoverMarkdown(scalar.name, scalar.representation);
  }
  const resource = resources.get(name);
  if (resource) {
    return resourceHoverMarkdown(name, resource);
  }
  return undefined;
}

/**
 * Field type on a resource: flat payload/identity map, else path on payload
 * (distributes over object unions — e.g. Entry.type / Entry.id).
 */
export function fieldTypeFromResource(
  resourceName: string,
  fieldName: string,
  resources: ResourceTable
): TypeExpr | undefined {
  const symbols = resources.get(resourceName);
  if (!symbols) return undefined;
  const fromMap = symbols.payload.get(fieldName) ?? symbols.identity.get(fieldName);
  if (fromMap) return fromMap.type;

  const sink = createDiagnosticSink();
  return resolvePathOnPayloadType([fieldName], symbols.payloadType, "hover", null, resources, sink);
}

/** Payload (or identity) field on a known resource. */
export function resourceFieldHoverMarkdown(
  resourceName: string,
  fieldName: string,
  resources: ResourceTable
): string | undefined {
  const symbols = resources.get(resourceName);
  if (!symbols) return undefined;
  const fromMap = symbols.payload.get(fieldName) ?? symbols.identity.get(fieldName);
  if (fromMap) {
    return fieldHoverMarkdown(fromMap.name, fromMap.type, fromMap.optional);
  }
  const type = fieldTypeFromResource(resourceName, fieldName, resources);
  if (!type) return undefined;
  return fieldHoverMarkdown(fieldName, type);
}

/** Object type from selected field names looked up on a resource. */
export function projectedFieldsType(
  fieldNames: string[],
  resourceName: string,
  resources: ResourceTable
): TypeExpr | undefined {
  if (!resources.has(resourceName)) return undefined;
  const symbols = resources.get(resourceName)!;
  const fields: FieldDecl[] = [];
  for (const name of fieldNames) {
    const fromMap = symbols.payload.get(name) ?? symbols.identity.get(name);
    if (fromMap) {
      fields.push({
        name: fromMap.name,
        type: fromMap.type,
        optional: fromMap.optional,
        inheritedFromIdentity: fromMap.inheritedFromIdentity,
        refers: fromMap.refers,
        span: fromMap.span,
      });
      continue;
    }
    const type = fieldTypeFromResource(resourceName, name, resources);
    if (type) {
      fields.push({
        name,
        type,
        optional: false,
        inheritedFromIdentity: false,
        refers: null,
        span: null,
      });
    }
  }
  return { kind: "object", fields, span: null };
}
