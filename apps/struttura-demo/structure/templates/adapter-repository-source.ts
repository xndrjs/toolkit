import { toKebabCase, toPascalCase } from "@xndrjs/struttura";

/** Thin scaffold: projects toward one core shape; loaders/ports/mappers are authored. */
export function adapterRepositorySource(input: {
  name: string;
  shape: string;
  feature: string;
}): string {
  const pascal = toPascalCase(input.name);
  const shapePascal = toPascalCase(input.shape);
  const coreFeature = toKebabCase(input.feature);
  return `import type { ${shapePascal} } from "@core/${coreFeature}/models";

export type ${pascal}RepositoryDeps = {
  // TODO: loaders, mappers, and other adapters this repository composes
};

export class ${pascal}Repository {
  constructor(private readonly deps: ${pascal}RepositoryDeps) {
    void this.deps;
  }

  async get${shapePascal}ById(_id: string): Promise<${shapePascal} | null> {
    throw new Error("Not implemented: ${pascal}Repository.get${shapePascal}ById");
  }
}
`;
}
