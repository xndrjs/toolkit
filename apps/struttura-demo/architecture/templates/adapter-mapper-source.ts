import { toKebabCase, toPascalCase } from "@xndrjs/struttura";

export function adapterMapperSource(input: {
  shape: string;
  feature: string;
  loader: string;
  vendor: string;
}): string {
  const shapePascal = toPascalCase(input.shape);
  const coreFeature = toKebabCase(input.feature);
  const loaderPascal = toPascalCase(input.loader);
  const vendor = toKebabCase(input.vendor);
  return `import type { ${shapePascal} } from "@core/${coreFeature}/models";
import type { Raw${loaderPascal} } from "@infrastructure/${vendor}";

export function mapRawTo${shapePascal}(raw: Raw${loaderPascal}): ${shapePascal} {
  void raw;
  throw new Error("Not implemented: mapRawTo${shapePascal}");
}
`;
}
