/**
 * Editorial entry source — one batch channel for CMS page + entry identities.
 *
 * Looks up by `spaceId/environmentId/id`. Root `Page` ARIs load full page
 * documents; `Entry` ARIs return the stored Entry payload as-is.
 */
import type { ResourceLoadContext } from "@xndrjs/ziel";

import {
  entryAri,
  pageAri,
  Scalars,
  type CmsEntriesContext,
  type EntryId,
  type EntryPayload,
  type EntryResource,
  type EnvironmentId,
  type Locale,
  type PagePayload,
  type PageResource,
  type SpaceId,
} from "../../generated";
import { demoEntries, entryLookupKey, type EditorialDocument } from "../fixtures/store.js";

export const ENTRY_SOURCE_ID = "CmsEntries";

type EntryIdentity = {
  spaceId: SpaceId;
  environmentId: EnvironmentId;
  id: EntryId;
  locale: Locale;
};

function entryIdentityOf(resource: { key: readonly unknown[] }): EntryIdentity | null {
  const key = resource.key[0];
  if (typeof key !== "object" || key === null) {
    return null;
  }
  const fields = key as Record<string, unknown>;
  if (
    typeof fields.spaceId !== "string" ||
    typeof fields.environmentId !== "string" ||
    typeof fields.id !== "string" ||
    typeof fields.locale !== "string"
  ) {
    return null;
  }
  return {
    spaceId: Scalars.SpaceId(fields.spaceId),
    environmentId: Scalars.EnvironmentId(fields.environmentId),
    id: Scalars.EntryId(fields.id),
    locale: Scalars.Locale(fields.locale),
  };
}

/** App `load` for the generated `CmsEntries` datasource. */
export function loadCmsEntries(entries: ReadonlyMap<string, EditorialDocument> = demoEntries) {
  return async (
    batch: readonly (PageResource | EntryResource)[],
    _context: ResourceLoadContext<CmsEntriesContext>
  ): Promise<readonly (PagePayload | EntryPayload | undefined)[]> =>
    batch.map((resource) => {
      const identity = entryIdentityOf(resource);
      if (identity === null) {
        return undefined;
      }

      const doc = entries.get(
        entryLookupKey({
          spaceId: identity.spaceId,
          environmentId: identity.environmentId,
          id: identity.id,
        })
      );
      if (doc === undefined) {
        return undefined;
      }

      if (pageAri.matches(resource)) {
        return doc.kind === "page" ? doc.payload : undefined;
      }

      if (entryAri.matches(resource)) {
        return doc.kind === "entry" ? doc.payload : undefined;
      }

      return undefined;
    });
}
