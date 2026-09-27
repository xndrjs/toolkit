import type { RefersPatternField, TypeExpr } from "../ir";
import { expandPayloadObjectMembers } from "./discriminants";
import type { ResourceTable } from "./symbols";

export type ObjectMember = Extract<TypeExpr, { kind: "object" }>;

/**
 * True when `member` satisfies every pattern field (AND): each named field must
 * be a `stringLiteral` whose value is in that pattern field's OR'd `values`.
 */
export function memberMatchesRefersPattern(
  member: ObjectMember,
  patternFields: RefersPatternField[]
): boolean {
  return patternFields.every((pf) => {
    const field = member.fields.find((f) => f.name === pf.name);
    return (
      field !== undefined &&
      field.type.kind === "stringLiteral" &&
      pf.values.includes(field.type.value)
    );
  });
}

/**
 * Expand `payloadType` to closed object members and keep those matching the
 * refers pattern. Returns `null` when the payload is not a closed object /
 * object-union (same as {@link expandPayloadObjectMembers}).
 */
export function membersMatchingRefersPattern(
  payloadType: TypeExpr,
  patternFields: RefersPatternField[],
  resources: ResourceTable
): ObjectMember[] | null {
  const members = expandPayloadObjectMembers(payloadType, resources);
  if (members === null) return null;
  return members.filter((m) => memberMatchesRefersPattern(m, patternFields));
}

/** True when no expanded member declares a field named `fieldName`. */
export function refersPatternFieldMissingOnAllMembers(
  members: ObjectMember[],
  fieldName: string
): boolean {
  return !members.some((m) => m.fields.some((f) => f.name === fieldName));
}
