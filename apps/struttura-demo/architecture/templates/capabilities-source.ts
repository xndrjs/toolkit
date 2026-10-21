import { toKebabCase, toPascalCase } from "@xndrjs/struttura";

export function capabilitiesSource(name: string): string {
  const pascal = toPascalCase(name);
  const kebab = toKebabCase(name);
  return `import { domain } from "@xndrjs/domain-zod";
import { ${pascal}Shape } from "../models/${kebab}.shape";

export const ${pascal}Capabilities = domain.capabilities
  .forShapeKit(${pascal}Shape)
  .methods(({ patch }) => ({
    // TODO: add capabilities
  }));
`;
}
