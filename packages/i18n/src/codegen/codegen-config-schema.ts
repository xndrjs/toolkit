import { z } from "zod";
import { SUPPORTED_IMPORT_EXTENSIONS } from "./constants.js";

export const CODEGEN_CONFIG_KEYS = [
  "dictionary",
  "namespaces",
  "defaultNamespace",
  "typesOutput",
  "dictionaryOutput",
  "instanceOutput",
  "dictionarySchemaOutput",
  "loadOnInit",
  "namespaceLoadersOutput",
  "importExtension",
  "paramsTypeName",
  "schemaTypeName",
  "localeTypeName",
  "localeFallbackConstName",
  "localeFallback",
  "factoryName",
] as const;

const localeFallbackSchema = z.record(z.string(), z.union([z.string(), z.null()]));

export const codegenConfigSchema = z
  .object({
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
  })
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
  });

export type CodegenConfig = z.infer<typeof codegenConfigSchema>;

export function formatCodegenConfigIssues(error: z.ZodError): string {
  const issueLines = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `  - ${path}: ${issue.message}`;
  });

  return [
    "[Codegen Error] Invalid i18n.codegen.json:",
    ...issueLines,
    "",
    `Allowed keys: ${CODEGEN_CONFIG_KEYS.join(", ")}`,
  ].join("\n");
}
