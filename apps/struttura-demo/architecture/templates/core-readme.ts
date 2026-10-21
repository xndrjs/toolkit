import { toKebabCase } from "@xndrjs/struttura";

export function coreReadme(name: string): string {
  const feature = toKebabCase(name);
  return `# @core/${feature}

## Purpose

What business capability does this bounded context own?
`;
}
