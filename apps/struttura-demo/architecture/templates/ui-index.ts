import { toKebabCase } from "@xndrjs/struttura";

export function uiIndex(name: string): string {
  const pkg = toKebabCase(name);
  return `/** Shared UI primitives for @ui/${pkg}. Importable from apps only. */
export {};
`;
}
