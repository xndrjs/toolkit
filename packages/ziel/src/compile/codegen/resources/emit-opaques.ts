import type { Program } from "../../../ir";

/**
 * Emit opaque runtime tokens and branded value type aliases from
 * `program.opaques`.
 *
 * Tokens use the product runtime (`defineOpaqueType` / `OpaqueValueOf`);
 * callers must import those symbols when this section is non-empty.
 *
 * ```ts
 * export const RichDocument = defineOpaqueType("RichDocument");
 * export type RichDocument = OpaqueValueOf<typeof RichDocument>;
 * ```
 */
export function emitOpaques(program: Program): string {
  if (program.opaques.length === 0) {
    return "";
  }

  return program.opaques
    .map((opaque) => {
      const name = opaque.name;
      return [
        `export const ${name} = defineOpaqueType(${JSON.stringify(name)});`,
        `export type ${name} = OpaqueValueOf<typeof ${name}>;`,
      ].join("\n");
    })
    .join("\n\n");
}
