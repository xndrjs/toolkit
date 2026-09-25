/**
 * Compile-time NaviQL surface: semantic IR, typechecker, Langium services, and codegen.
 * Import from `@xndrjs/naviql/compile` — keep out of client bundles.
 */
export * from "../ir";
export { checkProgram, type Diagnostic } from "../check";
export { createNaviQlServices, NaviQlModule, type NaviQlServices } from "../lang";
export { lowerProgram } from "./lower";
export {
  defineConfig,
  DEFAULT_NAVIQL_EXCLUDE,
  DEFAULT_NAVIQL_INCLUDE,
  type NaviQlCodegenConfig,
} from "./config/define-config";
export { collectNaviQlFiles, type CollectNaviQlFilesOptions } from "./collect/collect-naviql-files";
export { mergePrograms } from "./merge-programs";
export { parseAndCheck, type ParseAndCheckResult } from "./parse-and-check";
export {
  generateResources,
  type GenerateResourcesOptions,
  type GenerateResourcesResult,
} from "./codegen/generate-resources";
export {
  generateStrategies,
  type GenerateStrategiesOptions,
  type GenerateStrategiesResult,
} from "./codegen/generate-strategies";
export {
  generateProjections,
  type GenerateProjectionsOptions,
  type GenerateProjectionsResult,
} from "./codegen/generate-projections";
export {
  buildResources,
  type BuildResourcesOptions,
  type BuildResourcesResult,
} from "./codegen/build-resources";
