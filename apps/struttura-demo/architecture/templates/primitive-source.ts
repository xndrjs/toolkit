import { toPascalCase } from "@xndrjs/struttura";

export function primitiveSource(name: string): string {
  const pascal = toPascalCase(name);
  return `import { domain } from "@xndrjs/domain-zod";
import { z } from "zod";

export const ${pascal}Primitive = domain.primitive(
  "${pascal}",
  z.string(),
);

export type ${pascal} = ReturnType<(typeof ${pascal}Primitive)["create"]>;
`;
}
