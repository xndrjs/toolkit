/**
 * Pure hover markdown builders for NaviQL IntelliSense.
 * Providers resolve AST context, then call these with IR / check tables.
 */
import { formatType } from "../check/assignability";
import type { ResourceSymbols, ResourceTable, ScalarTable } from "../check/symbols";
import type { FieldDecl, TypeExpr } from "../ir";

/** Wrap a NaviQL signature in a fenced code block for LSP markdown hover. */
export function hoverCodeBlock(signature: string): string {
  return `\`\`\`naviql\n${signature}\n\`\`\``;
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

export function formatFieldSignature(name: string, type: TypeExpr): string {
  return `${name}: ${formatType(type)}`;
}

export function scalarHoverMarkdown(name: string, representation: string): string {
  return hoverCodeBlock(formatScalarSignature(name, representation));
}

export function resourceHoverMarkdown(name: string, symbols: ResourceSymbols): string {
  return hoverCodeBlock(formatResourceSignature(name, symbols));
}

export function fieldHoverMarkdown(name: string, type: TypeExpr): string {
  return hoverCodeBlock(formatFieldSignature(name, type));
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

/** Payload (or identity) field on a known resource. */
export function resourceFieldHoverMarkdown(
  resourceName: string,
  fieldName: string,
  resources: ResourceTable
): string | undefined {
  const symbols = resources.get(resourceName);
  if (!symbols) return undefined;
  const field: FieldDecl | undefined =
    symbols.payload.get(fieldName) ?? symbols.identity.get(fieldName);
  if (!field) return undefined;
  return fieldHoverMarkdown(field.name, field.type);
}
