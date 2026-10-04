import { RichDocument, Scalars, type EntryPayload } from "../../../generated/resources";
import type { EntryPayloadWire } from "../schemas/entry.js";

/** Map validated wire shape → Ziel `EntryPayload` (branded scalars / opaque wrap). */
export function mapWireToEntryPayload(wire: EntryPayloadWire): EntryPayload {
  switch (wire.kind) {
    case "Hero":
      return {
        kind: "Hero",
        id: Scalars.EntryId(wire.id),
        title: wire.title,
        body: RichDocument.wrap(wire.body),
        imageId: Scalars.AssetId(wire.imageId),
      };
    case "Tabs":
      return {
        kind: "Tabs",
        id: Scalars.EntryId(wire.id),
        title: wire.title,
        tabs: wire.tabs.map((link) => ({ id: Scalars.EntryId(link.id) })),
      };
    case "Tab":
      return {
        kind: "Tab",
        id: Scalars.EntryId(wire.id),
        title: wire.title,
        strips: wire.strips.map((link) => ({ id: Scalars.EntryId(link.id) })),
      };
    case "Product":
      return {
        kind: "Product",
        id: Scalars.EntryId(wire.id),
        sku: Scalars.Sku(wire.sku),
        title: wire.title,
      };
    case "Menu":
      return {
        kind: "Menu",
        id: Scalars.EntryId(wire.id),
        title: wire.title,
        logoId: Scalars.AssetId(wire.logoId),
      };
    case "Footer":
      return {
        kind: "Footer",
        id: Scalars.EntryId(wire.id),
        cta: wire.cta,
        title: wire.title,
        logoId: Scalars.AssetId(wire.logoId),
      };
    case "Page":
      return {
        kind: "Page",
        id: Scalars.EntryId(wire.id),
        title: wire.title,
      };
    case "SiteInternalLink":
      return {
        kind: "SiteInternalLink",
        id: Scalars.EntryId(wire.id),
        targetId: Scalars.EntryId(wire.targetId),
      };
  }
}
