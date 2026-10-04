/**
 * Compile-time Ziel surface: semantic IR, typechecker, Langium services, and codegen.
 * Import from `@xndrjs/ziel/compile` — keep out of client bundles.
 */
export * from "../ir";
export {
  analyzeProgram,
  checkProgram,
  type AnalyzeProgramOptions,
  type Diagnostic,
  type ProgramAnalysis,
  type OpaqueTable,
  type ResourceTable,
  type ScalarTable,
} from "../check";
export type {
  QueryPlan,
  ProjectionPlan,
  PlannedProjectionArm,
  PlannedProjectionBody,
} from "../analyze";
export { createZielServices, ZielModule, type ZielServices } from "../lang";
export { lowerProgram, lowerWorkspace, isLowerDiagnostic, LOWER_DIAGNOSTIC_CODES } from "./lower";
export {
  compileWorkspace,
  type CompileWorkspaceResult,
  type WorkspaceSource,
} from "./compile-workspace";
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
  buildGeneratedModule,
  buildResources,
  type BuildGeneratedModuleOptions,
  type BuildGeneratedModuleResult,
  type BuildResourcesOptions,
  type BuildResourcesResult,
} from "./codegen/build-generated-module";
export {
  composeGeneratedModule,
  composeGeneratedModules,
  type ComposeGeneratedModuleOptions,
  type ComposeGeneratedModuleResult,
  type ComposeGeneratedModulesResult,
  type GeneratedModuleFile,
} from "./codegen/compose-generated-module";
