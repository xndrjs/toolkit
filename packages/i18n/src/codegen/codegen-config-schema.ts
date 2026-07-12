import { z } from "zod";
import path from "node:path";
import {
  IDENTIFIER_NAME_PATTERN,
  IDENTIFIER_NAME_REQUIREMENT,
  SUPPORTED_IMPORT_EXTENSIONS,
} from "./constants.js";
import { getDeliveryArtifactsStructureIssues } from "./delivery-artifacts.js";

const localeFallbackSchema = z.record(z.string(), z.union([z.string(), z.null()]));
const deliveryArtifactsSchema = z.record(z.string(), z.array(z.string().min(1)));

export const DELIVERY_MODES = ["canonical", "split-by-locale", "custom"] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

const codegenConfigShape = {
  dictionary: z.string().min(1).optional(),
  namespaces: z.record(z.string(), z.string().min(1)).optional(),
  defaultNamespace: z.string().min(1).optional(),
  typesOutput: z.string().min(1),
  dictionaryOutput: z.string().min(1),
  instanceOutput: z.string().min(1),
  dictionarySchemaOutput: z.string().min(1).optional(),
  loadOnInit: z.array(z.string().min(1)).optional(),
  namespaceLoadersOutput: z.string().min(1).optional(),
  importExtension: z.enum(SUPPORTED_IMPORT_EXTENSIONS).optional(),
  paramsTypeName: z.string().min(1),
  schemaTypeName: z.string().min(1),
  localeTypeName: z.string().min(1).optional(),
  localeFallbackConstName: z.string().min(1).optional(),
  localeFallback: localeFallbackSchema.optional(),
  factoryName: z.string().min(1).optional(),
  delivery: z.enum(DELIVERY_MODES).optional().default("canonical"),
  deliveryArtifacts: deliveryArtifactsSchema.optional(),
  deliveryOutput: z.string().min(1).optional(),
};

export const codegenConfigKeys = Object.keys(
  codegenConfigShape
) as (keyof typeof codegenConfigShape)[];

export const codegenConfigSchema = z
  .object(codegenConfigShape)
  .strict()
  .superRefine((config, ctx) => {
    const hasDictionary = config.dictionary !== undefined;
    const hasNamespaces = config.namespaces !== undefined;

    if (hasDictionary === hasNamespaces) {
      ctx.addIssue({
        code: "custom",
        message: 'Specify exactly one of "dictionary" or "namespaces".',
      });
    }

    if (config.namespaces) {
      for (const namespace of Object.keys(config.namespaces)) {
        if (!IDENTIFIER_NAME_PATTERN.test(namespace)) {
          ctx.addIssue({
            code: "custom",
            path: ["namespaces", namespace],
            message: `Invalid namespace name "${namespace}" (${IDENTIFIER_NAME_REQUIREMENT}).`,
          });
        }
      }
    }

    if (
      config.defaultNamespace !== undefined &&
      !IDENTIFIER_NAME_PATTERN.test(config.defaultNamespace)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultNamespace"],
        message: `Invalid namespace name "${config.defaultNamespace}" (${IDENTIFIER_NAME_REQUIREMENT}).`,
      });
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

    if (config.loadOnInit !== undefined && config.delivery !== "canonical") {
      ctx.addIssue({
        code: "custom",
        path: ["loadOnInit"],
        message: 'loadOnInit is only allowed when delivery is "canonical".',
      });
    }
  });

export type CodegenConfigInput = z.input<typeof codegenConfigSchema>;
export type CodegenConfig = z.infer<typeof codegenConfigSchema>;

export function resolveDeliveryOutputDir(
  config: Pick<CodegenConfig, "typesOutput" | "deliveryOutput">
): string {
  return config.deliveryOutput ?? path.dirname(config.typesOutput);
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
