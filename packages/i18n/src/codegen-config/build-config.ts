import type { CodegenConfigInput } from "../codegen/codegen-config-schema.js";
import { typeNamesForProject } from "./type-names.js";

export type SetupMode = "single" | "multi";

const GENERATED_DIR = "generated";
const TRANSLATIONS_DIR = "translations";

export function buildCodegenConfig(mode: SetupMode, project: string): CodegenConfigInput {
  const typeNames = typeNamesForProject(project);
  const base = {
    typesOutput: `${GENERATED_DIR}/i18n-types.generated.ts`,
    dictionaryOutput: `${GENERATED_DIR}/dictionary.generated.ts`,
    instanceOutput: `${GENERATED_DIR}/instance.generated.ts`,
    paramsTypeName: typeNames.paramsTypeName,
    schemaTypeName: typeNames.schemaTypeName,
    localeTypeName: typeNames.localeTypeName,
    factoryName: "createI18n",
  } satisfies CodegenConfigInput;

  if (mode === "single") {
    return {
      dictionary: `${TRANSLATIONS_DIR}/translations.json`,
      ...base,
    };
  }

  return {
    namespaces: {
      default: `${TRANSLATIONS_DIR}/default.json`,
    },
    ...base,
  };
}
