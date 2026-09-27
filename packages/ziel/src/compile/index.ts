/**
 * Compile-time Ziel surface: semantic IR, typechecker, Langium services, and codegen.
 * Import from `@xndrjs/ziel/compile` — keep out of client bundles.
 */
export * from "../ir";
export {
  analyzeProgram,
  checkProgram,
  type Diagnostic,
  type ProgramAnalysis,
  type ResourceTable,
  type ScalarTable,
} from "../check";
export { createZielServices, ZielModule, type ZielServices } from "../lang";
export { lowerProgram, isLowerDiagnostic, LOWER_DIAGNOSTIC_CODES } from "./lower";
export {
  defineConfig,
  DEFAULT_ZIEL_EXCLUDE,
  DEFAULT_ZIEL_INCLUDE,
  type ZielCodegenConfig,
} from "./config/define-config";
export { collectZielFiles, type CollectZielFilesOptions } from "./collect/collect-ziel-files";
export { mergePrograms } from "./merge-programs";
export { parseAndCheck, type ParseAndCheckResult } from "./parse-and-check";
export {
  generateResources,
  type GenerateResourcesOptions,
  type GenerateResourcesResult,
} from "./codegen/generators/generate-resources";
export {
  generateStrategies,
  type GenerateStrategiesOptions,
  type GenerateStrategiesResult,
} from "./codegen/generators/generate-strategies";
export {
  generateProjections,
  type GenerateProjectionsOptions,
  type GenerateProjectionsResult,
} from "./codegen/generators/generate-projections";
export {
  generateDataSources,
  type GenerateDataSourcesOptions,
  type GenerateDataSourcesResult,
} from "./codegen/generators/generate-datasources";
export {
  buildResources,
  type BuildResourcesOptions,
  type BuildResourcesResult,
} from "./codegen/build-resources";
