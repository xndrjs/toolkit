import { Scalars, type PagePayload } from "../../../generated";
import type { PagePayloadWire } from "../schemas/page.js";

/** Map validated wire shape → Ziel `PagePayload` (branded scalars). */
export function mapWireToPagePayload(wire: PagePayloadWire): PagePayload {
  return {
    id: Scalars.EntryId(wire.id),
    title: wire.title,
    menuId: Scalars.EntryId(wire.menuId),
    footerId: Scalars.EntryId(wire.footerId),
    strips: wire.strips.map((link) => ({ id: Scalars.EntryId(link.id) })),
    related: wire.related.map((ref) => Scalars.CustomReferenceValue(ref)),
    primaryTerm: {
      kind: Scalars.TaxonomyKind(wire.primaryTerm.kind),
      id: Scalars.TermId(wire.primaryTerm.id),
    },
    relatedTerms: wire.relatedTerms.map((link) => ({
      kind: Scalars.TaxonomyKind(link.kind),
      id: Scalars.TermId(link.id),
    })),
  };
}
