/**
 * Editorial entry source — one batch channel for CMS entries.
 *
 * Looks up by `spaceId/environmentId/id` for any entry-shaped ARI
 * (`Entry`, `Hero`, `Page`, …). Generic `Entry` requests rematerialize to the
 * concrete resource declared by {@link editorialEntryRegistry}.
 */
import type { ApplicationResourceIdentifier } from "@xndrjs/naviql";
import { defineDataSourceFor, type DataSource } from "@xndrjs/naviql";

import {
  entryAri,
  footerAri,
  heroAri,
  menuAri,
  pageAri,
  productAri,
  tabAri,
  tabsAri,
  type ContentRegistry,
  type EntryId,
  type EnvironmentId,
  type Locale,
  type PageDetailExecutionContext,
  type SpaceId,
} from "../../generated/page-detail.js";
import { demoEntries, entryLookupKey, type EditorialEntryDocument } from "../fixtures/store.js";

export const ENTRY_SOURCE_ID = "cms-entries";

type EntryIdentity = {
  spaceId: SpaceId;
  environmentId: EnvironmentId;
  id: EntryId;
  locale: Locale;
};

type EntryRecord = {
  resource: ApplicationResourceIdentifier;
  payload: unknown;
  resolves?: readonly ApplicationResourceIdentifier[];
};

const defineEntrySource = defineDataSourceFor<ContentRegistry, PageDetailExecutionContext>();

function entryIdentityOf(resource: ApplicationResourceIdentifier): EntryIdentity | null {
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

/** Map a stored document to the concrete NaviQL ARI + payload. */
function toConcrete(identity: EntryIdentity, doc: EditorialEntryDocument): EntryRecord | undefined {
  switch (doc.contentTypeId) {
    case "page":
      return { resource: pageAri(identity), payload: doc.payload };
    case "menu":
      return { resource: menuAri(identity), payload: doc.payload };
    case "footer":
      return { resource: footerAri(identity), payload: doc.payload };
    case "tab":
      return { resource: tabAri(identity), payload: doc.payload };
    case "hero":
      return { resource: heroAri(identity), payload: doc.payload };
    case "tabs":
      return { resource: tabsAri(identity), payload: doc.payload };
    case "product":
      return { resource: productAri(identity), payload: doc.payload };
    default: {
      const _never: never = doc;
      return _never;
    }
  }
}

/** Content types that may be returned from a generic `Entry(...)` request. */
function isEntryUnionMember(
  contentTypeId: EditorialEntryDocument["contentTypeId"]
): contentTypeId is "hero" | "tabs" | "product" {
  return contentTypeId === "hero" || contentTypeId === "tabs" || contentTypeId === "product";
}

export function createEntrySource(
  entries: ReadonlyMap<string, EditorialEntryDocument> = demoEntries
): DataSource<ContentRegistry, PageDetailExecutionContext> {
  return defineEntrySource({
    id: ENTRY_SOURCE_ID,
    for: [pageAri, menuAri, footerAri, entryAri, heroAri, tabsAri, tabAri, productAri],
    async load(batch) {
      const records: EntryRecord[] = [];

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

        const concrete = toConcrete(identity, doc);
        if (concrete === undefined) {
          continue;
        }

        if (entryAri.matches(resource)) {
          if (!isEntryUnionMember(doc.contentTypeId)) {
            continue;
          }
          records.push({
            resource: concrete.resource,
            payload: concrete.payload,
            resolves: [resource],
          });
          continue;
        }

        if (concrete.resource.equals(resource)) {
          records.push({ resource, payload: concrete.payload });
        }
      }

      return records;
    },
  });
}
