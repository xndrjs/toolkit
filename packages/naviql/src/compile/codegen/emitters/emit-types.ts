import { createDiagnosticSink } from "../../../check/diagnostic";
import { resolveTypeExpr } from "../../../check/resolve-type";
import type { ResourceTable, ScalarTable } from "../../../check/symbols";
import type { Program, TypeExpr } from "../../../ir";
import { payloadTypeName } from "../naming";

/**
 * Parent context for TypeScript precedence.
 * `[]` binds tighter than `|`, so union / nullable array elements need parens.
 */
type PrintContext = "root" | "array-elem";

function tablesFromProgram(program: Program): {
  scalars: ScalarTable;
  resources: ResourceTable;
} {
  const scalars: ScalarTable = new Map(program.scalars.map((s) => [s.name, s]));
  const resources: ResourceTable = new Map();
  for (const resource of program.resources) {
    const payloadFields = resource.payloadType.kind === "object" ? resource.payloadType.fields : [];
    resources.set(resource.name, {
      identity: new Map(resource.identity.fields.map((f) => [f.name, f])),
      payload: new Map(payloadFields.map((f) => [f.name, f])),
      payloadType: resource.payloadType,
    });
  }
  return { scalars, resources };
}

function resolveForEmit(
  type: TypeExpr,
  path: string,
  scalars: ScalarTable,
  resources: ResourceTable
): TypeExpr {
  const sink = createDiagnosticSink();
  const resolved = resolveTypeExpr(type, path, scalars, resources, sink);
  if (!resolved || sink.diagnostics.length > 0) {
    const detail =
      sink.diagnostics.map((d) => d.message).join("; ") || "resolution returned undefined";
    throw new Error(`emitPayloadTypes: failed to resolve '${path}': ${detail}`);
  }
  return resolved;
}

/**
 * Print a resolved `TypeExpr` as a TypeScript type string.
 * `resourceRef("Tab")` → `TabPayload`. Callers must resolve `typeProjection` first.
 *
 * @param indent - Brace nesting depth for multi-line object literals (0 = top-level).
 */
export function printTypeExpr(type: TypeExpr, ctx: PrintContext = "root", indent = 0): string {
  switch (type.kind) {
    case "primitive":
      return type.name;
    case "scalarRef":
      return type.name;
    case "resourceRef":
      return payloadTypeName(type.name);
    case "stringLiteral":
      return JSON.stringify(type.value);
    case "nullable": {
      // `A | B | null` / `T[] | null` — no extra parens.
      const inner = `${printTypeExpr(type.of, "root", indent)} | null`;
      return ctx === "array-elem" ? `(${inner})` : inner;
    }
    case "array":
      return `${printTypeExpr(type.of, "array-elem", indent)}[]`;
    case "object": {
      if (type.fields.length === 0) {
        return "{}";
      }
      const pad = "  ".repeat(indent);
      const fieldPad = "  ".repeat(indent + 1);
      const fields = type.fields
        .map((f) => `${fieldPad}${f.name}: ${printTypeExpr(f.type, "root", indent + 1)};`)
        .join("\n");
      return `{\n${fields}\n${pad}}`;
    }
    case "union": {
      const members = type.members.map((m) => printTypeExpr(m, "root", indent)).join(" | ");
      return ctx === "array-elem" ? `(${members})` : members;
    }
    case "typeProjection":
      throw new Error(`printTypeExpr: unresolved typeProjection '${type.resource}.${type.field}'`);
  }
}

/**
 * Emit `*Payload` TypeScript types from each resource's `payloadType`.
 *
 * ```ts
 * export type PostPayload = {
 *   id: PostId;
 *   title: string;
 *   …
 * };
 * export type TabCollectionPayload = TabPayload[];
 * export type EditorialModulePayload = TabsPayload | HeroPayload | ProductPayload;
 * ```
 *
 * `typeProjection` is resolved (via `resolveTypeExpr`) before printing.
 * `resourceRef("R")` emits `RPayload`.
 */
export function emitPayloadTypes(program: Program): string {
  if (program.resources.length === 0) {
    return "";
  }

  const { scalars, resources } = tablesFromProgram(program);

  return program.resources
    .map((resource) => {
      const path = `resources.${resource.name}.payloadType`;
      const resolved = resolveForEmit(resource.payloadType, path, scalars, resources);
      const name = payloadTypeName(resource.name);
      const body = printTypeExpr(resolved);
      return `export type ${name} = ${body};`;
    })
    .join("\n\n");
}
