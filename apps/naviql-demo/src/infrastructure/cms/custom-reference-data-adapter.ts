/**
 * In-memory CustomReference decode.
 *
 * Parses `env@space|ENTRY|id` or `env@space|ASSET|id` into the decode payload.
 * Redirect hops are declared in the query (`resolve to`), not here.
 */
import { defineDataSourceFor, type DataSource } from "@xndrjs/naviql";

import {
  customReferenceAri,
  type AssetId,
  type ContentRegistry,
  type CustomReferencePayload,
  type CustomReferenceResource,
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
      const records: { resource: CustomReferenceResource; payload: CustomReferencePayload }[] = [];

      for (const resource of batch) {
        if (!customReferenceAri.matches(resource)) {
          continue;
        }
        const key = resource.key[0] as { ref: string; locale: Locale };
        const parsed = parseCustomReference(key.ref);
        if (parsed === null) {
          continue;
        }

        records.push({
          resource,
          payload:
            parsed.kind === "ENTRY"
              ? {
                  type: "Entry",
                  spaceId: parsed.spaceId,
                  environmentId: parsed.environmentId,
                  id: parsed.id as EntryId,
                  locale: key.locale,
                }
              : {
                  type: "Asset",
                  spaceId: parsed.spaceId,
                  environmentId: parsed.environmentId,
                  id: parsed.id as AssetId,
                  locale: key.locale,
                },
        });
      }

      return records;
    },
  });
}
