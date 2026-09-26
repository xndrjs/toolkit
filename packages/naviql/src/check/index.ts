export type { Diagnostic } from "./diagnostic";
export { checkProgram } from "./check-program";
export {
  memberMatchesRefersPattern,
  membersMatchingRefersPattern,
  refersPatternFieldMissingOnAllMembers,
  type ObjectMember,
} from "./refers";
export { resolveTypeExpr } from "./resolve-type";
