/**
 * Editorial entry source — one batch channel for CMS page + entry identities.
 *
 * Looks up by `spaceId/environmentId/id`. Root `Page` ARIs load full page
 * documents; `Entry` ARIs return the stored Entry payload as-is (no rematerialize).
 */
import { defineDataSourceFor, type DataSource } from "@xndrjs/naviql";

import {
  entryAri,
  pageAri,
  type ContentRegistry,
  type EntryId,
  type EntryPayload,
  type EnvironmentId,
  type Locale,
  type PageDetailExecutionContext,
  type PagePayload,
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
      const records: (
        | { resource: ReturnType<typeof pageAri>; payload: PagePayload }
        | { resource: ReturnType<typeof entryAri>; payload: EntryPayload }
      )[] = [];

      for (const resource of batch) {
        const identity = entryIdentityOf(resource);
        if (identity === null) {
          continue;
        }

        const doc = entries.get(
          entryLookupKey({
            spaceId: identity.spaceId,
            environmentId: identity.environmentId,
            id: identity.id,
          })
        );
        if (doc === undefined) {
          continue;
        }

        if (pageAri.matches(resource)) {
          if (doc.kind !== "page") {
            continue;
          }
          records.push({ resource, payload: doc.payload });
          continue;
        }

        if (entryAri.matches(resource)) {
          if (doc.kind !== "entry") {
            continue;
          }
          records.push({
            resource: entryAri(identity),
            payload: doc.payload,
          });
        }
      }

      return records;
    },
  });
}
