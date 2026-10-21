import { toKebabCase } from "@xndrjs/struttura";

export function uiReadme(name: string): string {
  const pkg = toKebabCase(name);
  return `# @ui/${pkg}

Shared UI package (apps only).
`;
}
