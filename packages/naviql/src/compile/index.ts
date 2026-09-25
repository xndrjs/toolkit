/**
 * Compile-time NaviQL surface: semantic IR, typechecker, and Langium services.
 * Import from `@xndrjs/naviql/compile` — keep out of client bundles.
 * Later: `parseAndCheck`, codegen.
 */
export * from "../ir";
export { checkProgram, type Diagnostic } from "../check";
export { createNaviQlServices, NaviQlModule, type NaviQlServices } from "../lang";
export { lowerProgram } from "./lower";
