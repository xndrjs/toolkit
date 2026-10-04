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
export type { FieldMap, OpaqueTable, ResourceSymbols, ResourceTable, ScalarTable } from "./symbols";
export { containsOpaqueType, isOpaqueLeafType, checkNoOpaqueInType } from "./opaque-validation";
export { queryReferencedResources, requiredQueryContextFields } from "./check-datasources";
