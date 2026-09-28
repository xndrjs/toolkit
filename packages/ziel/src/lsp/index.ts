/**
 * `@xndrjs/ziel/lsp` — language server bootstrap + workspace validation helpers.
 * Keep out of the main `@xndrjs/ziel` runtime entry.
 */
export {
  isMissingOnDiagnostic,
  missingOnEditsForQuery,
  missingOnInsertOffset,
  missingOnInsertText,
  missingOnStubLine,
  uniqueProjectionBinding,
  usedBindingsInQuery,
  ZielCodeActionProvider,
} from "./code-action";
export {
  classifyCompletionContext,
  completionPrefix,
  completionsAtOffset,
  ZielCompletionProvider,
  selectableFieldNames,
  type CompletionTables,
  type SemanticCompletionItem,
} from "./completion";
export {
  parseTrailingPathAccess,
  pathCompletionsAtOffset,
  pathFieldCompletions,
  type PathAccess,
  type PathFieldCompletion,
} from "./completion-path";
export {
  collectStringLiteralValues,
  literalCompletionsAtOffset,
  parseTrailingLiteralCompare,
  type LiteralCompareSite,
  type LiteralValueCompletion,
} from "./completion-literal";
export { buildExprScope, type ExprScopeTables } from "./expr-scope";
export { createZielLspServices } from "./create-services";
export { ZielFormatter } from "./formatter";
export {
  definitionSpanAtOffset,
  definitionSpanForCstLeaf,
  ZielDefinitionProvider,
  type DefinitionTables,
} from "./definition";
export { diagnosticToLsp, diagnosticsToLsp, type PositionAt } from "./diagnostics-to-lsp";
export { hoverMarkdownAtOffset, hoverMarkdownForCstLeaf, ZielHoverProvider } from "./hover";
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
export { findZielConfigFile } from "./resolve-config-root";
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
