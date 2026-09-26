/**
 * `@xndrjs/naviql/lsp` — language server bootstrap + workspace validation helpers.
 * Keep out of the main `@xndrjs/naviql` runtime entry.
 */
export { createNaviQlLspServices } from "./create-services";
export { diagnosticToLsp, diagnosticsToLsp, type PositionAt } from "./diagnostics-to-lsp";
export { findNaviQlConfigFile } from "./resolve-config-root";
export {
  registerWorkspaceValidation,
  type RegisterWorkspaceValidationOptions,
} from "./register-workspace-validation";
export {
  createSemanticSnapshotCache,
  type SemanticSnapshot,
  type SemanticSnapshotCache,
} from "./semantic-snapshot";
export {
  validateWorkspace,
  type WorkspaceSemanticResult,
  type WorkspaceValidateOptions,
  type WorkspaceValidateResult,
} from "./workspace-validate";
