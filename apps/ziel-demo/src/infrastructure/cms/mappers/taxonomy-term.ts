import { Scalars, type TaxonomyTermPayload } from "../../../generated";
import type { TaxonomyTermPayloadWire } from "../schemas/taxonomy-term.js";

/** Map validated wire shape → Ziel `TaxonomyTermPayload` (branded scalars). */
export function mapWireToTaxonomyTermPayload(wire: TaxonomyTermPayloadWire): TaxonomyTermPayload {
  return {
    kind: Scalars.TaxonomyKind(wire.kind),
    id: Scalars.TermId(wire.id),
    label: wire.label,
    slug: wire.slug,
  };
}
