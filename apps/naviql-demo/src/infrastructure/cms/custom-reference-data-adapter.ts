/**
 * In-memory CustomReference → Entry | Asset redirect.
 *
 * Does not fetch CMS/CDN data and must not share the entry/asset batch channels:
 * it only parses `env@space|ENTRY|id` or `env@space|ASSET|id` into a canonical ARI.
 */
import type { ResourceRedirectRecord } from "@xndrjs/naviql";
import { defineDataSourceFor, type DataSource } from "@xndrjs/naviql";

import {
  assetAri,
  customReferenceAri,
  entryAri,
  type AssetId,
  type ContentRegistry,
  type EntryId,
  type Locale,
  type PageDetailExecutionContext,
} from "../../generated/page-detail.js";
import { parseCustomReference } from "./custom-reference.js";

export const CUSTOM_REFERENCE_SOURCE_ID = "cms-custom-references";

const defineCustomReferenceSource = defineDataSourceFor<
  ContentRegistry,
  PageDetailExecutionContext
>();

export function createCustomReferenceSource(): DataSource<
  ContentRegistry,
  PageDetailExecutionContext
> {
  return defineCustomReferenceSource({
    id: CUSTOM_REFERENCE_SOURCE_ID,
    for: [customReferenceAri],
    async load(batch) {
      const records: ResourceRedirectRecord[] = [];

      for (const resource of batch) {
        if (!customReferenceAri.matches(resource)) {
          continue;
        }
        const key = resource.key[0] as { ref: string; locale: Locale };
        const parsed = parseCustomReference(key.ref);
        if (parsed === null) {
          continue;
        }

        if (parsed.kind === "ENTRY") {
          records.push({
            redirect: true,
            resource: entryAri({
              spaceId: parsed.spaceId,
              environmentId: parsed.environmentId,
              id: parsed.id as EntryId,
              locale: key.locale,
            }),
            resolves: [resource],
          });
        } else {
          records.push({
            redirect: true,
            resource: assetAri({
              spaceId: parsed.spaceId,
              environmentId: parsed.environmentId,
              id: parsed.id as AssetId,
              locale: key.locale,
            }),
            resolves: [resource],
          });
        }
      }

      return records;
    },
  });
}
