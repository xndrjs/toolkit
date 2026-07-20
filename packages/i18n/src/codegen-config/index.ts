export type {
  CodegenConfig,
  CodegenConfigInput,
  DeliveryMode,
  LoaderStrategy,
  ResolvedCodegenPaths,
} from "../codegen/codegen-config-schema.js";
export {
  codegenConfigKeys,
  DELIVERY_MODES,
  LOADER_STRATEGIES,
  GENERATED_BASENAMES,
  DEFAULT_FACTORY_NAME,
  DEFAULT_LOCALE_FALLBACK_CONST_NAME,
  formatCodegenConfigIssues,
  resolveCodegenPaths,
  resolveArtifactsPath,
} from "../codegen/codegen-config-schema.js";
export { loadConfig, resolveNamespaces } from "../codegen/config.js";

export type { DeliveryArtifactsMap } from "../codegen/delivery-artifacts.js";

export {
  SUPPORTED_IMPORT_EXTENSIONS,
  type SupportedImportExtension,
} from "../codegen/constants.js";

export { buildCodegenConfig } from "./build-config.js";
export { inferProjectName, typeNamesForProject } from "./type-names.js";
export { writeCodegenConfig } from "./write-config.js";

export { runCodegen, type RunCodegenInput, type RunCodegenResult } from "../codegen/run-codegen.js";
export {
  regenerateNamespaces,
  type RegenerateNamespacesInput,
  type RegenerateNamespacesResult,
} from "../codegen/regenerate-namespaces.js";
