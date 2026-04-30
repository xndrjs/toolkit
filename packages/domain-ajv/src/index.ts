/**
 * Ajv adapter for `@xndrjs/domain`: use `jsonSchemaToValidator` for JSON Schema
 * and `openApiComponentToValidator` for bundled OpenAPI components.
 * Re-exports `@xndrjs/domain` for single-entry imports.
 */
export {
  createAjvDomainAdapter,
  jsonSchemaToValidator,
  openApiComponentToValidator,
  type AjvDomainAdapterOptions,
  type AjvLike,
  type OpenApiBundle,
} from "./ajv-to-validator";

export * from "@xndrjs/domain";
