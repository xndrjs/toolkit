import { toCamelCase, toPascalCase } from "@xndrjs/struttura";

export function domainServiceSource(name: string): string {
  const pascal = toPascalCase(name);
  const camel = toCamelCase(name);
  return `/** Cross-model domain logic for ${pascal} (pure functions). */
export function ${camel}Service() {
  // TODO: implement domain service
}
`;
}
