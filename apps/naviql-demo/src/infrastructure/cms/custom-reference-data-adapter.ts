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
  type EntryId,
  type PageDetailExecutionContext,
} from "../../generated";
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
      return batch.map((resource) => {
        if (!customReferenceAri.matches(resource)) {
          return undefined;
        }
        const key = resource.key[0];
        const parsed = parseCustomReference(key.ref);
        if (parsed === null) {
          return undefined;
        }

        return parsed.kind === "ENTRY"
          ? {
              type: "Entry" as const,
              spaceId: parsed.spaceId,
              environmentId: parsed.environmentId,
              id: parsed.id as EntryId,
            }
          : {
              type: "Asset" as const,
              spaceId: parsed.spaceId,
              environmentId: parsed.environmentId,
              id: parsed.id as AssetId,
            };
      });
    },
  });
}
