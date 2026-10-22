import { toCamelCase, toPascalCase } from "@xndrjs/struttura";

export function useCaseSource(name: string): string {
  const pascal = toPascalCase(name);
  const camel = toCamelCase(name);
  return `/**
 * Use case "${camel}"
 * Wire in the app composition root (e.g. getWebServerRoot(ctx).${camel}).
 */
export interface ${pascal}UseCaseDeps {
  // Add required ports here.
}

export function create${pascal}UseCase(_deps: ${pascal}UseCaseDeps) {
  return async function ${camel}() {
    throw new Error("Not implemented: ${pascal} use case");
  };
}
`;
}
