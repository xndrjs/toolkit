/**
 * In-memory CustomReference decode.
 *
 * Parses `env@space|ENTRY|id` or `env@space|ASSET|id` into the decode payload.
 * Redirect hops are declared in the query (`resolve to`), not here.
 */
import type { ResourceLoadContext } from "@xndrjs/ziel";

import {
  customReferenceAri,
  type CmsCustomReferencesContext,
  type CustomReferencePayload,
  type CustomReferenceResource,
} from "../../generated";
import { parsePayload } from "../schemas/parse-payload.js";
import { parseCustomReference } from "./custom-reference.js";
import { mapWireToCustomReferencePayload } from "./mappers/index.js";
import { customReferencePayloadSchema } from "./schemas/index.js";

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
    const parsed = parseCustomReference(resource.key[0].ref);
    if (parsed === null) {
      return undefined;
    }
    const wire = parsePayload(
      customReferencePayloadSchema,
      {
        kind: parsed.kind === "ENTRY" ? "Entry" : "Asset",
        spaceId: parsed.spaceId,
        environmentId: parsed.environmentId,
        id: parsed.id,
      },
      "CustomReference"
    );
    return mapWireToCustomReferencePayload(wire);
  });
}
