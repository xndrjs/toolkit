/**
 * Parse / format legacy custom reference strings:
 * `{environmentId}@{spaceId}|ENTRY|{id}` or `|ASSET|{id}`.
 */
import type { CustomReferenceValue, EnvironmentId, SpaceId } from "../../generated/page-detail.js";

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
  return `${parts.environmentId}@${parts.spaceId}|${parts.kind}|${parts.id}` as CustomReferenceValue;
}

export function parseCustomReference(ref: string): ParsedCustomReference | null {
  const match = CUSTOM_REF_RE.exec(ref);
  if (!match) {
    return null;
  }
  return {
    environmentId: match[1]! as EnvironmentId,
    spaceId: match[2]! as SpaceId,
    kind: match[3]! as CustomReferenceKind,
    id: match[4]!,
  };
}
