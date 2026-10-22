import { toKebabCase, toPascalCase } from "@xndrjs/struttura";

/** Thin scaffold: maps toward one core shape; raw vendor params are authored. */
export function adapterMapperSource(input: { shape: string; feature: string }): string {
  const shapePascal = toPascalCase(input.shape);
  const coreFeature = toKebabCase(input.feature);
  return `import type { ${shapePascal} } from "@core/${coreFeature}/models";

export function mapRawTo${shapePascal}(/* add raw type(s) from @infrastructure/* */): ${shapePascal} {
  throw new Error("Not implemented: mapRawTo${shapePascal}");
}
`;
}
