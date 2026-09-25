/**
 * Compile-time NaviQL surface: semantic IR and typechecker.
 * Import from `@xndrjs/naviql/compile` — keep out of client bundles.
 * Later: Langium parse/lower, `parseAndCheck`, codegen.
 */
export * from "../ir";
export { checkProgram, type Diagnostic } from "../check";
