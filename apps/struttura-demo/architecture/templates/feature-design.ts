import { toPascalCase } from "@xndrjs/struttura";

export function featureDesign(name: string): string {
  const title = toPascalCase(name);
  return `# ${title} — DESIGN

How it maps to @core kits, operations, use cases, ports, @infrastructure loaders, and @adapter packages.
`;
}
