/**
 * In-memory CustomReference decode.
 *
 * Parses `env@space|ENTRY|id` or `env@space|ASSET|id` into the decode payload.
 * Redirect hops are declared in the query (`resolve to`), not here.
 */
import type { ResourceLoadContext } from "@xndrjs/ziel";

import {
  customReferenceAri,
  Scalars,
  type CmsCustomReferencesContext,
  type CustomReferencePayload,
  type CustomReferenceResource,
} from "../../generated";
import { parseCustomReference } from "./custom-reference.js";

export const CUSTOM_REFERENCE_SOURCE_ID = "CmsCustomReferences";

/** App `load` for the generated `CmsCustomReferences` datasource. */
export async function loadCmsCustomReferences(
  batch: readonly CustomReferenceResource[],
  _context: ResourceLoadContext<CmsCustomReferencesContext>
): Promise<readonly (CustomReferencePayload | undefined)[]> {
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
          kind: "Entry" as const,
          spaceId: parsed.spaceId,
          environmentId: parsed.environmentId,
          id: Scalars.EntryId(parsed.id),
        }
      : {
          kind: "Asset" as const,
          spaceId: parsed.spaceId,
          environmentId: parsed.environmentId,
          id: Scalars.AssetId(parsed.id),
        };
  });
}
