import { toKebabCase } from "@xndrjs/struttura";

export function adapterReadme(input: { name: string; feature: string }): string {
  const pkg = toKebabCase(input.name);
  const feature = toKebabCase(input.feature);
  return `# @adapter/${pkg}

Maps infrastructure payloads onto @core/${feature} (mappers; repositories are separate kits).
`;
}
