import Ajv2020 from "ajv/dist/2020.js";
import addFormatsPlugin from "ajv-formats";
import type { ErrorObject, ValidateFunction } from "ajv";
import type { ValidationIssue, Validator } from "@xndrjs/domain";

export interface AjvLike {
  compile(schema: object): ValidateFunction;
  addSchema(schema: object, key?: string): void;
  removeSchema(key: string): void;
}

export interface OpenApiBundle {
  components?: {
    schemas?: Record<string, object>;
  };
}

export interface AjvDomainAdapterOptions {
  instance?: AjvLike;
}

function createDefaultAjv(): AjvLike {
  const AjvCtor = Ajv2020 as unknown as {
    default?: new (options: { allErrors: boolean; strict: boolean }) => AjvLike;
  };
  const AjvClass =
    AjvCtor.default ??
    (Ajv2020 as unknown as new (options: { allErrors: boolean; strict: boolean }) => AjvLike);

  const addFormatsImport = addFormatsPlugin as unknown as {
    default?: (ajv: AjvLike) => void;
  };
  const addFormats =
    addFormatsImport.default ?? (addFormatsPlugin as unknown as (ajv: AjvLike) => void);

  const ajv = new AjvClass({
    allErrors: true,
    strict: false,
  });
  addFormats(ajv);
  return ajv;
}

function parsePath(instancePath: string): (string | number)[] {
  if (instancePath.length === 0) {
    return [];
  }
  return instancePath
    .split("/")
    .slice(1)
    .map((segment) => {
      const decoded = decodeURIComponent(segment.replace(/~1/g, "/").replace(/~0/g, "~"));
      return /^\d+$/.test(decoded) ? Number(decoded) : decoded;
    });
}

function toIssue(error: ErrorObject): ValidationIssue {
  const basePath = parsePath(error.instancePath ?? "");

  if (error.keyword === "required" && typeof error.params === "object" && error.params !== null) {
    const missingProperty = (error.params as { missingProperty?: unknown }).missingProperty;
    if (typeof missingProperty === "string") {
      return {
        code: error.keyword,
        path: [...basePath, missingProperty],
        message: error.message ?? `Missing required property "${missingProperty}"`,
        meta: error.params,
      };
    }
  }

  return {
    code: error.keyword,
    path: basePath,
    message: error.message ?? "Validation failed",
    meta: error.params,
  };
}

export function createAjvDomainAdapter(options: AjvDomainAdapterOptions = {}) {
  const ajv = options.instance ?? createDefaultAjv();
  const validatorCache = new Map<string, ValidateFunction>();

  function mapAjvFailure(validate: ValidateFunction) {
    return {
      success: false as const,
      error: {
        engine: "ajv",
        issues: (validate.errors ?? []).map(toIssue),
        raw: validate.errors,
      },
    };
  }

  function jsonSchemaToValidator<Output>(schema: object): Validator<unknown, Output> {
    const validate = ajv.compile(schema);
    return {
      engine: "ajv",
      validate(input) {
        if (!validate(input)) {
          return mapAjvFailure(validate);
        }
        return {
          success: true as const,
          data: input as Output,
        };
      },
    };
  }

  function openApiComponentToValidator<Output>(
    bundle: OpenApiBundle,
    componentName: string
  ): Validator<unknown, Output> {
    const schemas = bundle.components?.schemas;
    if (!schemas?.[componentName]) {
      throw new Error(`OpenAPI component schema "${componentName}" was not found`);
    }

    const cacheKey = `openapi#/components/schemas/${componentName}`;
    const existing = validatorCache.get(cacheKey);
    const validate =
      existing ??
      (() => {
        ajv.removeSchema("openapi");
        ajv.addSchema(bundle, "openapi");
        const compiled = ajv.compile({ $ref: cacheKey });
        validatorCache.set(cacheKey, compiled);
        return compiled;
      })();

    return {
      engine: "ajv",
      validate(input) {
        if (!validate(input)) {
          return mapAjvFailure(validate);
        }
        return {
          success: true as const,
          data: input as Output,
        };
      },
    };
  }

  return {
    jsonSchemaToValidator,
    openApiComponentToValidator,
  };
}

const defaultAdapter = createAjvDomainAdapter();

export const jsonSchemaToValidator = defaultAdapter.jsonSchemaToValidator;
export const openApiComponentToValidator = defaultAdapter.openApiComponentToValidator;
