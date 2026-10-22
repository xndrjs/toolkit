import { toPascalCase } from "@xndrjs/struttura";

export function portSource(name: string): string {
  const pascal = toPascalCase(name);
  return `export interface ${pascal}Port {}
`;
}
