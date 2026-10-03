import type { PrimitiveTypeName, Program } from "../../../ir";

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
 * Emit branded scalar type aliases and a `Scalars` factory namespace from
 * `program.scalars`.
 *
 * Factories are cast-only ergonomics helpers (primitive → branded); no runtime
 * validation.
 *
 * ```ts
 * declare const __brand: unique symbol;
 * type Branded<Name extends string, T> = T & { readonly [__brand]: Name };
 *
 * export type PostId = Branded<"PostId", string>;
 *
 * export const Scalars = {
 *   PostId: (value: string): PostId => value as PostId,
 * } as const;
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

  const factories = program.scalars.map((scalar) => {
    const rep = primitiveTsType(scalar.representation);
    return `  ${scalar.name}: (value: ${rep}): ${scalar.name} => value as ${scalar.name},`;
  });

  const scalarsNs = ["export const Scalars = {", ...factories, "} as const;"].join("\n");

  return [BRANDED_HELPER, ...aliases, scalarsNs].join("\n\n");
}
