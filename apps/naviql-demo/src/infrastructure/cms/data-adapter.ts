/**
 * Editorial entry source — one batch channel for CMS page + entry identities.
 *
 * Looks up by `spaceId/environmentId/id`. Root `Page` ARIs load full page
 * documents; `Entry` ARIs return the stored Entry payload as-is.
 */
import { defineDataSourceFor, type DataSource } from "@xndrjs/naviql";

import {
  entryAri,
  pageAri,
  type ContentRegistry,
  type PageDetailExecutionContext,
} from "../../generated";
import { demoEntries, entryLookupKey, type EditorialDocument } from "../fixtures/store.js";

export const ENTRY_SOURCE_ID = "cms-entries";

const defineEntrySource = defineDataSourceFor<ContentRegistry, PageDetailExecutionContext>();

export function createEntrySource(
  entries: ReadonlyMap<string, EditorialDocument> = demoEntries
): DataSource<ContentRegistry, PageDetailExecutionContext> {
  return defineEntrySource({
    id: ENTRY_SOURCE_ID,
    for: [pageAri, entryAri],
    async load(batch) {
      return batch.map((resource) => {
        const identity = resource.key[0];
        if (identity === null) {
          return undefined;
        }

        // get from store
        const doc = entries.get(
          entryLookupKey({
            spaceId: identity.spaceId,
            environmentId: identity.environmentId,
            id: identity.id,
          })
        );

        return doc?.payload;
      });
    },
  });
}
