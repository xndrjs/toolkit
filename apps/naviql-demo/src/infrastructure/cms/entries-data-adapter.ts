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
  type EntryId,
  type EnvironmentId,
  type Locale,
  type PageDetailExecutionContext,
  type SpaceId,
} from "../../generated/page-detail.js";
import { demoEntries, entryLookupKey, type EditorialDocument } from "../fixtures/store.js";

export const ENTRY_SOURCE_ID = "cms-entries";

type EntryIdentity = {
  spaceId: SpaceId;
  environmentId: EnvironmentId;
  id: EntryId;
  locale: Locale;
};

const defineEntrySource = defineDataSourceFor<ContentRegistry, PageDetailExecutionContext>();

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
    spaceId: fields.spaceId as SpaceId,
    environmentId: fields.environmentId as EnvironmentId,
    id: fields.id as EntryId,
    locale: fields.locale as Locale,
  };
}

export function createEntrySource(
  entries: ReadonlyMap<string, EditorialDocument> = demoEntries
): DataSource<ContentRegistry, PageDetailExecutionContext> {
  return defineEntrySource({
    id: ENTRY_SOURCE_ID,
    for: [pageAri, entryAri],
    async load(batch) {
      return batch.map((resource) => {
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
    },
  });
}
