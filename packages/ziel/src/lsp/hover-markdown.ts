/**
 * Pure hover markdown builders for Ziel IntelliSense.
 * Providers resolve AST context, then call these with IR / check tables.
 *
 * Hover signatures use multiline pretty-printing (DSL-like); compact
 * `formatType` from assignability stays for diagnostics and completion detail.
 */
import { createDiagnosticSink } from "../check/diagnostic";
import { resolvePathOnPayloadType } from "../check/expr-paths";
import type { ResourceSymbols, ResourceTable, ScalarTable } from "../check/symbols";
import type { FieldDecl, TypeExpr } from "../ir";

/** Wrap a Ziel signature in a fenced code block for LSP markdown hover. */
export function hoverCodeBlock(signature: string): string {
  return `\`\`\`ziel\n${signature}\n\`\`\``;
}

function pad(depth: number): string {
  return "  ".repeat(depth);
}

/**
 * Pretty-print a type for hover (multiline objects/unions, DSL-ish layout).
 * Keeps scalars / primitives / refs on one line.
 */
export function formatTypePretty(type: TypeExpr, depth = 0): string {
  switch (type.kind) {
    case "primitive":
      return type.name;
    case "scalarRef":
    case "resourceRef":
      return type.name;
    case "stringLiteral":
      return JSON.stringify(type.value);
    case "null":
      return "null";
    case "nullable":
      return `${formatTypePretty(type.of, depth)} | null`;
    case "array": {
      const inner = formatTypePretty(type.of, depth);
      if (inner.includes("\n")) {
        return `${inner}[]`;
      }
      return type.of.kind === "union" || type.of.kind === "nullable"
        ? `(${inner})[]`
        : `${inner}[]`;
    }
    case "object": {
      if (type.fields.length === 0) {
        return "{ }";
      }
      const inner = pad(depth + 1);
      const close = pad(depth);
      const lines = type.fields.map(
        (f) => `${inner}${f.name}${f.optional ? "?" : ""}: ${formatTypePretty(f.type, depth + 1)}`
      );
      return `{\n${lines.join("\n")}\n${close}}`;
    }
    case "union": {
      const members = type.members.map((m) => formatTypePretty(m, depth));
      if (members.some((m) => m.includes("\n"))) {
        return members.join("\n| ");
      }
      return members.join(" | ");
    }
    case "typeProjection":
      return `${type.resource}.${type.field}`;
  }
}

export function formatScalarSignature(name: string, representation: string): string {
  return `scalar ${name} on ${representation}`;
}

/** `resource Name(…): Payload` — multiline when identity has ≥2 fields or payload is nested. */
export function formatResourceSignature(name: string, symbols: ResourceSymbols): string {
  const identityFields = [...symbols.identity.values()];
  let head: string;

  if (identityFields.length === 0) {
    head = `resource ${name}()`;
  } else if (identityFields.length === 1) {
    const field = identityFields[0]!;
    head = `resource ${name}(${field.name}: ${formatTypePretty(field.type)})`;
  } else {
    const lines = identityFields.map((field, index) => {
      const comma = index < identityFields.length - 1 ? "," : "";
      return `  ${field.name}: ${formatTypePretty(field.type)}${comma}`;
    });
    head = `resource ${name}(\n${lines.join("\n")}\n)`;
  }

  return `${head}: ${formatTypePretty(symbols.payloadType)}`;
}

export function formatFieldSignature(name: string, type: TypeExpr, optional = false): string {
  return `${name}${optional ? "?" : ""}: ${formatTypePretty(type)}`;
}

/** `fragment Name on Resource: { … }` — projected payload shape. */
export function formatFragmentSignature(
  name: string,
  resource: string,
  projectedType: TypeExpr
): string {
  return `fragment ${name} on ${resource}: ${formatTypePretty(projectedType)}`;
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
