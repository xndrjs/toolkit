/**
 * Editorial entry source — one batch channel for CMS page + entry identities.
 *
 * Looks up by `spaceId/environmentId/id`. Root `Page` ARIs load page documents;
 * `Entry` ARIs return the stored Entry payload as-is.
 */
import type { ResourceLoadContext } from "@xndrjs/ziel";

import {
  entryAri,
  pageAri,
  type CmsEntriesContext,
  type EntryPayload,
  type EntryResource,
  type PagePayload,
  type PageResource,
} from "../../generated";
import { demoEntries, entryLookupKey, type EditorialDocument } from "../fixtures/cms-store.js";
import { parsePayload } from "../schemas/parse-payload.js";
import { mapWireToEntryPayload, mapWireToPagePayload } from "./mappers/index.js";
import { entryPayloadSchema, pagePayloadSchema } from "./schemas/index.js";

export const ENTRY_SOURCE_ID = "CmsEntries";

type CmsEntriesResource = PageResource | EntryResource;
type CmsEntriesPayload = PagePayload | EntryPayload;

/**
 * App `load` for the generated `CmsEntries` datasource.
 * Validates store documents at the loader boundary before returning them.
 */
export function loadCmsEntries(entries: ReadonlyMap<string, EditorialDocument> = demoEntries) {
  return async (
    batch: readonly CmsEntriesResource[],
    _context: ResourceLoadContext<CmsEntriesContext>
  ): Promise<readonly (CmsEntriesPayload | undefined)[]> =>
    batch.map((resource) => {
      if (pageAri.matches(resource)) {
        const { spaceId, environmentId, id } = resource.key;
        const doc = entries.get(entryLookupKey({ spaceId, environmentId, id }));
        if (doc?.kind !== "page") return undefined;
        const wire = parsePayload(pagePayloadSchema, doc.payload, "Page");
        return mapWireToPagePayload(wire);
      }

      if (entryAri.matches(resource)) {
        const { spaceId, environmentId, id } = resource.key;
        const doc = entries.get(entryLookupKey({ spaceId, environmentId, id }));
        if (doc?.kind !== "entry") return undefined;
        const wire = parsePayload(entryPayloadSchema, doc.payload, "Entry");
        return mapWireToEntryPayload(wire);
      }

      return undefined;
    });
}
