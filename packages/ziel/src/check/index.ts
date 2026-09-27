export type { Diagnostic } from "./diagnostic";
export { analyzeProgram, checkProgram, type ProgramAnalysis } from "./check-program";
export {
  memberMatchesRefersPattern,
  membersMatchingRefersPattern,
  refersPatternFieldMissingOnAllMembers,
  type ObjectMember,
} from "./refers";
export {
  normalizeIncludeMode,
  payloadSelectableFields,
  resolveSelectedFields,
  type PayloadTypeLookup,
  type SelectableField,
} from "./projection-include";
export { resolveTypeExpr } from "./resolve-type";
export type { ResourceSymbols, ResourceTable, ScalarTable } from "./symbols";
