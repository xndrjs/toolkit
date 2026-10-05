import type { PrimitiveTypeName, Program, TypeExpr } from "../../../ir";
import { ariFactoryName, resourceTypeName } from "../naming";

function primitiveKeySchema(representation: PrimitiveTypeName): string {
  switch (representation) {
    case "string":
      return "s.string()";
    case "number":
      return "s.number()";
    case "integer":
      return "s.integer()";
    case "boolean":
      return "s.boolean()";
  }
}

/**
 * Map an identity field type to a primitive key-schema call.
 * Scalar refs use the scalar's representation (`PostId` → `s.string()`), never branded validators.
 */
function identityFieldKeySchema(
  type: TypeExpr,
  scalarReps: ReadonlyMap<string, PrimitiveTypeName>
): string {
  switch (type.kind) {
    case "primitive":
      return primitiveKeySchema(type.name);
    case "scalarRef": {
      const rep = scalarReps.get(type.name);
      if (rep === undefined) {
        throw new Error(`emitResources: unknown scalar '${type.name}' in identity`);
      }
      return primitiveKeySchema(rep);
    }
    default:
      throw new Error(
        `emitResources: identity field type '${type.kind}' is not a primitive key schema`
      );
  }
}

function emitObjectKeySchema(
  fields: { name: string; type: TypeExpr }[],
  scalarReps: ReadonlyMap<string, PrimitiveTypeName>
): string {
  const entries = fields.map((f) => `${f.name}: ${identityFieldKeySchema(f.type, scalarReps)}`);
  return `s.object({ ${entries.join(", ")} })`;
}

/**
 * Emit `ari(...)` factories and `*Resource` aliases from `program.resources`.
 *
 * ```ts
 * export const postAri = ari(
 *   "Post",
 *   s.object({ id: s.string(), locale: s.string() }),
 * );
 * export type PostResource = ReturnType<typeof postAri>;
 * ```
 *
 * Key schemas use representation primitives only (`number` → `s.number()`, `integer` → `s.integer()`).
 * Field order matches IR `identity.fields`. ARI type string is `resource.ariType`.
 */
export function emitResources(program: Program): string {
  if (program.resources.length === 0) {
    return "";
  }

  const scalarReps = new Map(
    program.scalars.map((scalar) => [scalar.name, scalar.representation] as const)
  );

  return program.resources
    .map((resource) => {
      const factory = ariFactoryName(resource.name);
      const resourceType = resourceTypeName(resource.name);
      const keySchema = emitObjectKeySchema(resource.identity.fields, scalarReps);
      const ariType = JSON.stringify(resource.ariType);

      return [
        `export const ${factory} = ari(`,
        `  ${ariType},`,
        `  ${keySchema},`,
        `);`,
        `export type ${resourceType} = ReturnType<typeof ${factory}>;`,
      ].join("\n");
    })
    .join("\n\n");
}
