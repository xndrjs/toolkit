import { toCamelCase, toPascalCase } from "@xndrjs/struttura";

export function infrastructureLoaderSource(name: string): string {
  const pascal = toPascalCase(name);
  const camel = toCamelCase(name);
  return `/**
 * Loader "${camel}"
 *
 * Fetches raw ${pascal} records from an external service.
 * Knows only the infrastructural shape — no @core/* types.
 */
export type Raw${pascal} = {
  // TODO: vendor-specific fields
};

export type ${pascal}LoaderDeps = {
  // client: VendorClient;
};

export class ${pascal}Loader {
  constructor(private readonly deps: ${pascal}LoaderDeps) {}

  async get(id: string): Promise<Raw${pascal} | null> {
    throw new Error("Not implemented: ${pascal}Loader.get");
  }

  async getMany(ids: string[]): Promise<Raw${pascal}[]> {
    throw new Error("Not implemented: ${pascal}Loader.getMany");
  }
}
`;
}
