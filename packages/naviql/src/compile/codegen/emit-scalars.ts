import type { PrimitiveTypeName, Program } from "../../ir";

/**
 * Local type-only brand helper (mirrors `@xndrjs/domain` idea; no dependency).
 * Emitted once when the program defines any scalars.
 */
const BRANDED_HELPER = [
  "declare const __brand: unique symbol;",
  "type Branded<Name extends string, T> = T & { readonly [__brand]: Name };",
].join("\n");

function primitiveTsType(representation: PrimitiveTypeName): string {
  return representation;
}

/**
 * Emit branded scalar type aliases from `program.scalars`.
 *
 * ```ts
 * declare const __brand: unique symbol;
 * type Branded<Name extends string, T> = T & { readonly [__brand]: Name };
 *
 * export type PostId = Branded<"PostId", string>;
 * ```
 */
export function emitScalars(program: Program): string {
  if (program.scalars.length === 0) {
    return "";
  }

  const aliases = program.scalars.map((scalar) => {
    const rep = primitiveTsType(scalar.representation);
    return `export type ${scalar.name} = Branded<${JSON.stringify(scalar.name)}, ${rep}>;`;
  });

  return [BRANDED_HELPER, ...aliases].join("\n\n");
}
