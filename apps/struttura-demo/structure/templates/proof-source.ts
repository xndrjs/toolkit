import { toPascalCase } from "@xndrjs/struttura";

export function proofSource(name: string): string {
  const pascal = toPascalCase(name);
  return `import { domain } from "@xndrjs/domain-zod";
import { z } from "zod";

export const ${pascal}Proof = domain
  .proof(
    "${pascal}",
    z.object({
      // TODO: define proof baseline schema
    }),
  )
  .refineType((row): row is typeof row & { /* TODO */ } => {
    return true;
  });

export type ${pascal} = ReturnType<(typeof ${pascal}Proof)["assert"]>;
`;
}
