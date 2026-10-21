import { toCamelCase, toKebabCase, toPascalCase } from "@xndrjs/struttura";

export function adapterRepositorySource(input: {
  name: string;
  shape: string;
  port: string;
  loader: string;
  vendor: string;
  feature: string;
}): string {
  const pascal = toPascalCase(input.name);
  const shapePascal = toPascalCase(input.shape);
  const shapeKebab = toKebabCase(input.shape);
  const portPascal = toPascalCase(input.port);
  const loaderPascal = toPascalCase(input.loader);
  const loaderCamel = toCamelCase(input.loader);
  const vendor = toKebabCase(input.vendor);
  const coreFeature = toKebabCase(input.feature);
  return `import type { ${shapePascal} } from "@core/${coreFeature}/models";
import type { ${portPascal}Port } from "@core/${coreFeature}/ports";
import { ${loaderPascal}Loader } from "@infrastructure/${vendor}";

import { mapRawTo${shapePascal} } from "../mappers/${shapeKebab}.mapper";

export type ${pascal}RepositoryDeps = {
  ${loaderCamel}Loader: ${loaderPascal}Loader;
};

export class ${pascal}Repository implements ${portPascal}Port {
  constructor(private readonly deps: ${pascal}RepositoryDeps) {}

  async get${shapePascal}ById(id: string): Promise<${shapePascal} | null> {
    const raw = await this.deps.${loaderCamel}Loader.get(id);
    return raw ? mapRawTo${shapePascal}(raw) : null;
  }
}
`;
}
