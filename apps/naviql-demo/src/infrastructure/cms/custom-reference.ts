/**
 * Parse / format legacy custom reference strings:
 * `{environmentId}@{spaceId}|ENTRY|{id}` or `|ASSET|{id}`.
 */
import {
  Scalars,
  type CustomReferenceValue,
  type EnvironmentId,
  type SpaceId,
} from "../../generated";

export type CustomReferenceKind = "ENTRY" | "ASSET";

export type ParsedCustomReference = {
  environmentId: EnvironmentId;
  spaceId: SpaceId;
  kind: CustomReferenceKind;
  id: string;
};

const CUSTOM_REF_RE = /^([^@]+)@([^|]+)\|(ENTRY|ASSET)\|(.+)$/;

export function encodeCustomReference(parts: {
  environmentId: string;
  spaceId: string;
  kind: CustomReferenceKind;
  id: string;
}): CustomReferenceValue {
  return Scalars.CustomReferenceValue(
    `${parts.environmentId}@${parts.spaceId}|${parts.kind}|${parts.id}`
  );
}

export function parseCustomReference(ref: string): ParsedCustomReference | null {
  const match = CUSTOM_REF_RE.exec(ref);
  if (!match) {
    return null;
  }
  return {
    environmentId: Scalars.EnvironmentId(match[1]!),
    spaceId: Scalars.SpaceId(match[2]!),
    kind: match[3]! as CustomReferenceKind,
    id: match[4]!,
  };
}
