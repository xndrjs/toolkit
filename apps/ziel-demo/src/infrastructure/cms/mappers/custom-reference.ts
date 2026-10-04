import { Scalars, type CustomReferencePayload } from "../../../generated/resources";
import type { CustomReferencePayloadWire } from "../schemas/custom-reference.js";

/** Map validated wire shape → Ziel `CustomReferencePayload` (branded scalars). */
export function mapWireToCustomReferencePayload(
  wire: CustomReferencePayloadWire
): CustomReferencePayload {
  if (wire.kind === "Entry") {
    return {
      kind: "Entry",
      spaceId: Scalars.SpaceId(wire.spaceId),
      environmentId: Scalars.EnvironmentId(wire.environmentId),
      id: Scalars.EntryId(wire.id),
    };
  }
  return {
    kind: "Asset",
    spaceId: Scalars.SpaceId(wire.spaceId),
    environmentId: Scalars.EnvironmentId(wire.environmentId),
    id: Scalars.AssetId(wire.id),
  };
}
