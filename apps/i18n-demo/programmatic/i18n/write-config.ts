import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCodegenConfig,
  type CodegenConfigInput,
  writeCodegenConfig,
} from "@xndrjs/i18n/codegen";

const project = "ProgrammaticDemo";
const i18nDir = path.dirname(fileURLToPath(import.meta.url));
const translationsDir = "translations";

const config: CodegenConfigInput = {
  ...buildCodegenConfig(project),
  namespaces: {
    default: `${translationsDir}/default.json`,
    cms: `${translationsDir}/cms.json`,
  },
  localeFallback: {
    en: null,
    it: "en",
  },
};

writeCodegenConfig(path.join(i18nDir, "i18n.codegen.json"), config);

console.log(`Wrote ${path.join(i18nDir, "i18n.codegen.json")}`);
