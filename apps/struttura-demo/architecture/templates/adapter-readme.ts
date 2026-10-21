import { toKebabCase } from "@xndrjs/struttura";

export function adapterReadme(input: { name: string; vendor: string; feature: string }): string {
  const pkg = toKebabCase(input.name);
  const vendor = toKebabCase(input.vendor);
  const feature = toKebabCase(input.feature);
  return `# @adapter/${pkg}

Projects @infrastructure/${vendor} loaders onto @core/${feature} ports.
`;
}
