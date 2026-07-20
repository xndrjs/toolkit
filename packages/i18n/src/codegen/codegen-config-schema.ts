import { z } from "zod";
import path from "node:path";
import { IDENTIFIER_NAME_PATTERN, IDENTIFIER_NAME_REQUIREMENT } from "./constants.js";
import { getDeliveryArtifactsStructureIssues } from "./delivery-artifacts.js";
import { typeNamesForProject } from "../codegen-config/type-names.js";

const localeFallbackSchema = z.record(z.string(), z.union([z.string(), z.null()]));
const deliveryArtifactsSchema = z.record(z.string(), z.array(z.string().min(1)));

export const DELIVERY_MODES = ["split-by-locale", "custom"] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export const LOADER_STRATEGIES = ["import", "fetch"] as const;
export type LoaderStrategy = (typeof LOADER_STRATEGIES)[number];

const PROJECT_NAME_PATTERN = /^[A-Z][a-zA-Z0-9]*$/;

const codegenConfigShape = {
  /** PascalCase project id — generates `{project}Params`, `{project}Schema`, `{project}Locale`. */
  projectName: z
    .string()
    .min(1)
    .regex(PROJECT_NAME_PATTERN, 'projectName must be PascalCase (e.g. "MyApp")'),
  namespaces: z.record(z.string(), z.string().min(1)),
  /**
   * Directory for generated TypeScript modules:
   * `i18n-types.generated.ts`, `instance.generated.ts`,
   * `namespace-loaders.generated.ts`, `dictionary-schema.generated.ts`.
   */
  codegenPath: z.string().min(1),
  localeFallback: localeFallbackSchema.optional(),
  delivery: z.enum(DELIVERY_MODES).optional().default("split-by-locale"),
  deliveryArtifacts: deliveryArtifactsSchema.optional(),
  /** Directory for delivery JSON (`translations/`). Defaults to {@link codegenPath}. */
  artifactsPath: z.string().min(1).optional(),
  /**
   * How generated `namespaceLoaders` resolve artifacts.
   * - `import` (default): dynamic `import()` — JSON is bundled; content updates need a rebuild.
   * - `fetch`: runtime `fetchImpl({ locale, namespace, area? })` via required `createI18n({ fetchImpl })`.
   *   Codegen does not know URLs — mapping id → transport is an application concern.
   */
  loaderStrategy: z.enum(LOADER_STRATEGIES).optional().default("import"),
};

export const codegenConfigKeys = Object.keys(
  codegenConfigShape
) as (keyof typeof codegenConfigShape)[];

export const codegenConfigSchema = z
  .object(codegenConfigShape)
  .strict()
  .superRefine((config, ctx) => {
    for (const namespace of Object.keys(config.namespaces)) {
      if (!IDENTIFIER_NAME_PATTERN.test(namespace)) {
        ctx.addIssue({
          code: "custom",
          path: ["namespaces", namespace],
          message: `Invalid namespace name "${namespace}" (${IDENTIFIER_NAME_REQUIREMENT}).`,
        });
      }
    }

    if (config.delivery === "custom") {
      if (!config.deliveryArtifacts) {
        ctx.addIssue({
          code: "custom",
          path: ["deliveryArtifacts"],
          message: 'deliveryArtifacts is required when delivery is "custom".',
        });
      } else {
        for (const issue of getDeliveryArtifactsStructureIssues(config.deliveryArtifacts)) {
          ctx.addIssue({
            code: "custom",
            path: issue.path,
            message: issue.message,
          });
        }
      }
    } else if (config.deliveryArtifacts !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["deliveryArtifacts"],
        message: 'deliveryArtifacts is only allowed when delivery is "custom".',
      });
    }
  });

export type CodegenConfigInput = z.input<typeof codegenConfigSchema>;
export type CodegenConfig = z.infer<typeof codegenConfigSchema>;

export const GENERATED_BASENAMES = {
  types: "i18n-types.generated.ts",
  instance: "instance.generated.ts",
  namespaceLoaders: "namespace-loaders.generated.ts",
  dictionarySchema: "dictionary-schema.generated.ts",
} as const;

export const DEFAULT_FACTORY_NAME = "createI18n";
export const DEFAULT_LOCALE_FALLBACK_CONST_NAME = "LOCALE_FALLBACK";

/** Derived paths and symbol names from `projectName` + `codegenPath`. */
export interface ResolvedCodegenPaths {
  codegenPath: string;
  typesOutput: string;
  instanceOutput: string;
  namespaceLoadersOutput: string;
  dictionarySchemaOutput: string;
  artifactsPath: string;
  paramsTypeName: string;
  schemaTypeName: string;
  localeTypeName: string;
  localeFallbackConstName: string;
  factoryName: string;
  deliveryAreaTypeName: string;
}

export function resolveCodegenPaths(
  config: Pick<CodegenConfig, "projectName" | "codegenPath" | "artifactsPath">
): ResolvedCodegenPaths {
  const typeNames = typeNamesForProject(config.projectName);
  const codegenPath = config.codegenPath;
  return {
    codegenPath,
    typesOutput: path.join(codegenPath, GENERATED_BASENAMES.types),
    instanceOutput: path.join(codegenPath, GENERATED_BASENAMES.instance),
    namespaceLoadersOutput: path.join(codegenPath, GENERATED_BASENAMES.namespaceLoaders),
    dictionarySchemaOutput: path.join(codegenPath, GENERATED_BASENAMES.dictionarySchema),
    artifactsPath: config.artifactsPath ?? codegenPath,
    paramsTypeName: typeNames.paramsTypeName,
    schemaTypeName: typeNames.schemaTypeName,
    localeTypeName: typeNames.localeTypeName,
    localeFallbackConstName: DEFAULT_LOCALE_FALLBACK_CONST_NAME,
    factoryName: DEFAULT_FACTORY_NAME,
    deliveryAreaTypeName: `${config.projectName}DeliveryArea`,
  };
}

export function resolveArtifactsPath(
  config: Pick<CodegenConfig, "codegenPath" | "artifactsPath">
): string {
  return config.artifactsPath ?? config.codegenPath;
}

export function formatCodegenConfigIssues(error: z.ZodError): string {
  const issueLines = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `  - ${path}: ${issue.message}`;
  });

  return [
    "[Codegen Error] Invalid i18n.codegen.json:",
    ...issueLines,
    "",
    `Allowed keys: ${codegenConfigKeys.join(", ")}`,
  ].join("\n");
}
