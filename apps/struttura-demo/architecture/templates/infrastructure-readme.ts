import { toKebabCase } from "@xndrjs/struttura";

export function infrastructureReadme(name: string): string {
  const pkg = toKebabCase(name);
  return `# @infrastructure/${pkg}

Vendor client, raw loaders, and schemas for ${pkg}.
`;
}
