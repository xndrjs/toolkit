export type { Diagnostic, DiagnosticSeverity } from "./diagnostic";
export { isErrorDiagnostic } from "./diagnostic";
export {
  analyzeProgram,
  checkProgram,
  type AnalyzeProgramOptions,
  type ProgramAnalysis,
} from "./check-program";
export {
  memberMatchesRefersPattern,
  membersMatchingRefersPattern,
  refersPatternFieldMissingOnAllMembers,
  type ObjectMember,
} from "./refers";
export {
  normalizeIncludeMode,
  payloadIntersectionFields,
  payloadSelectableFields,
  resolveSelectedFields,
  checkExcludedFields,
  type PayloadTypeLookup,
  type SelectableField,
} from "./projection-include";
export { resolveTypeExpr } from "./resolve-type";
export type { ResourceSymbols, ResourceTable, ScalarTable, FieldMap } from "./symbols";
export { queryReferencedResources, requiredQueryContextFields } from "./check-datasources";
