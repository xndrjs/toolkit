import { toPascalCase, toSnakeCase } from "@xndrjs/struttura";

export function domainErrorSource(name: string): string {
  const pascal = toPascalCase(name);
  const code = toSnakeCase(name).toUpperCase();
  return `export class ${pascal}Error extends Error {
  readonly code = "${code}" as const;

  constructor(message = "${pascal}") {
    super(message);
    this.name = "${pascal}Error";
  }
}
`;
}
