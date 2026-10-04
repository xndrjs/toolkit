import { Scalars, type ErrorLabPayload } from "../../../generated/resources";
import type { ErrorLabPayloadWire } from "../schemas/error-lab.js";

/** Map validated wire shape → Ziel `ErrorLabPayload` (branded scalars). */
export function mapWireToErrorLabPayload(wire: ErrorLabPayloadWire): ErrorLabPayload {
  return {
    id: Scalars.EntryId(wire.id),
    title: wire.title,
    softSingleId: Scalars.EntryId(wire.softSingleId),
    errorSingleId: Scalars.EntryId(wire.errorSingleId),
    throwSingleId: Scalars.EntryId(wire.throwSingleId),
    softItems: wire.softItems.map((link) => ({ id: Scalars.EntryId(link.id) })),
    errorItems: wire.errorItems.map((link) => ({ id: Scalars.EntryId(link.id) })),
    throwItems: wire.throwItems.map((link) => ({ id: Scalars.EntryId(link.id) })),
  };
}
