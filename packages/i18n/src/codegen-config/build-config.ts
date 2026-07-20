import type { CodegenConfigInput } from "../codegen/codegen-config-schema.js";

const GENERATED_DIR = "generated";
const TRANSLATIONS_DIR = "translations";

export function buildCodegenConfig(project: string): CodegenConfigInput {
  return {
    projectName: project,
    namespaces: {
      default: `${TRANSLATIONS_DIR}/default.json`,
    },
    delivery: "split-by-locale",
    codegenPath: GENERATED_DIR,
  };
}
