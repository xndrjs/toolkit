/**
 * `@xndrjs/naviql/lsp` — language server bootstrap + workspace validation helpers.
 * Keep out of the main `@xndrjs/naviql` runtime entry.
 */
export {
  classifyCompletionContext,
  completionPrefix,
  completionsAtOffset,
  NaviQlCompletionProvider,
  selectableFieldNames,
  type CompletionTables,
  type SemanticCompletionItem,
} from "./completion";
export { createNaviQlLspServices } from "./create-services";
export { diagnosticToLsp, diagnosticsToLsp, type PositionAt } from "./diagnostics-to-lsp";
export { hoverMarkdownAtOffset, hoverMarkdownForCstLeaf, NaviQlHoverProvider } from "./hover";
export {
  fieldHoverMarkdown,
  fieldTypeFromResource,
  formatFieldSignature,
  formatFragmentSignature,
  formatResourceSignature,
  formatScalarSignature,
  fragmentHoverMarkdown,
  hoverCodeBlock,
  namedTypeHoverMarkdown,
  projectedFieldsType,
  resourceFieldHoverMarkdown,
  resourceHoverMarkdown,
  scalarHoverMarkdown,
} from "./hover-markdown";
export {
  collectFragmentTable,
  fragmentHoverMarkdownFor,
  fragmentProjectedType,
  lookupFragmentHoverMarkdown,
} from "./hover-fragment";
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
