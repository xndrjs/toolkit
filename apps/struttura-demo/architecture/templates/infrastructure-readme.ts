import { toKebabCase } from "@xndrjs/struttura";

export function infrastructureReadme(name: string): string {
  const pkg = toKebabCase(name);
  return `# @infrastructure/${pkg}

Vendor client and raw loaders for ${pkg}.
`;
}
