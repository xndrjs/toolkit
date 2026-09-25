/**
 * Compile-time NaviQL surface: semantic IR, typechecker, Langium services, and codegen.
 * Import from `@xndrjs/naviql/compile` — keep out of client bundles.
 */
export * from "../ir";
export { checkProgram, type Diagnostic } from "../check";
export { createNaviQlServices, NaviQlModule, type NaviQlServices } from "../lang";
export { lowerProgram } from "./lower";
export { parseAndCheck, type ParseAndCheckResult } from "./parse-and-check";
export {
  generateResources,
  type GenerateResourcesOptions,
  type GenerateResourcesResult,
} from "./codegen/generate-resources";
