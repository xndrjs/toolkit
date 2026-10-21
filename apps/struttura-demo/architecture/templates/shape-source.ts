import { toPascalCase } from "@xndrjs/struttura";

export function shapeSource(name: string): string {
  const pascal = toPascalCase(name);
  return `import { domain } from "@xndrjs/domain-zod";
import { z } from "zod";

export const ${pascal}Shape = domain.shape(
  "${pascal}",
  z.object({
    kind: z.literal("${pascal}").default("${pascal}"),
    // TODO: define shape fields
  }),
);

export type ${pascal} = ReturnType<(typeof ${pascal}Shape)["create"]>;
`;
}
