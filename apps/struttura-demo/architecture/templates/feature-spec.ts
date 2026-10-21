import { toPascalCase } from "@xndrjs/struttura";

export function featureSpec(name: string): string {
  const title = toPascalCase(name);
  return `# ${title} — SPEC

What the feature does in domain language (no vendor terms).
`;
}
