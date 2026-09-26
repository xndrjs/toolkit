/**
 * Maps vendor CMS content-type IDs → NaviQL resource names for {@link Entry} rematerialization.
 *
 * This is infrastructure knowledge — not part of NaviQL semantics.
 * `Entry(...): Hero | Tabs | Product` declares allowed results; this registry
 * describes how *this* editorial backend discriminates them.
 */
import type { ContentRegistry } from "../../generated/page-detail.js";

/** Resource names that may be materialized from a generic {@link Entry}. */
export type EntryResultResourceName = Extract<keyof ContentRegistry, "Hero" | "Tabs" | "Product">;

/**
 * Explicit editorial content-type → NaviQL resource mapping.
 * Convention often matches (`"hero"` → `"Hero"`); keep this table so legacy
 * names can diverge without polluting the DSL.
 */
export const editorialEntryRegistry = {
  hero: "Hero",
  tabs: "Tabs",
  product: "Product",
} as const satisfies Record<string, EntryResultResourceName>;

export type EditorialEntryContentTypeId = keyof typeof editorialEntryRegistry;

export function resolveEditorialEntryResource(
  contentTypeId: string
): EntryResultResourceName | undefined {
  if (Object.prototype.hasOwnProperty.call(editorialEntryRegistry, contentTypeId)) {
    return editorialEntryRegistry[contentTypeId as EditorialEntryContentTypeId];
  }
  return undefined;
}
