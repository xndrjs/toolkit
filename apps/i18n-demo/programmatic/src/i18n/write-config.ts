import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCodegenConfig,
  type CodegenConfigInput,
  writeCodegenConfig,
} from "@xndrjs/i18n/codegen";

const project = "ProgrammaticDemo";
const i18nDir = path.dirname(fileURLToPath(import.meta.url));

const config: CodegenConfigInput = {
  ...buildCodegenConfig("single", project),
  dictionarySchemaOutput: "generated/dictionary-schema.generated.ts",
  localeFallback: {
    en: null,
    it: "en",
  },
};

writeCodegenConfig(path.join(i18nDir, "i18n.codegen.json"), config);

console.log(`Wrote ${path.join(i18nDir, "i18n.codegen.json")}`);
