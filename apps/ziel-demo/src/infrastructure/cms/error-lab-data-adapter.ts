/**
 * Demo-only ErrorLab source for the error-handling showcase.
 * Separate lane from CmsEntries — page-detail CMS loading never sees these roots.
 */
import type { ResourceLoadContext } from "@xndrjs/ziel";

import {
  errorLabAri,
  type ErrorLabPayload,
  type ErrorLabResource,
  type ErrorLabStoreContext,
} from "../../generated";
import { entryLookupKey } from "../fixtures/cms-store.js";
import { demoErrorLabs } from "../fixtures/error-lab-store.js";
import type { ErrorLabPayloadWire } from "./schemas/error-lab.js";
import { parsePayload } from "../schemas/parse-payload.js";
import { mapWireToErrorLabPayload } from "./mappers/index.js";
import { errorLabPayloadSchema } from "./schemas/index.js";

export const ERROR_LAB_SOURCE_ID = "ErrorLabStore";

/** App `load` for the generated `ErrorLabStore` datasource. */
export function loadErrorLabStore(labs: ReadonlyMap<string, ErrorLabPayloadWire> = demoErrorLabs) {
  return async (
    batch: readonly ErrorLabResource[],
    _context: ResourceLoadContext<ErrorLabStoreContext>
  ): Promise<readonly (ErrorLabPayload | undefined)[]> =>
    batch.map((resource) => {
      if (!errorLabAri.matches(resource)) {
        return undefined;
      }
      const { spaceId, environmentId, id } = resource.key[0];
      const raw = labs.get(entryLookupKey({ spaceId, environmentId, id }));
      if (raw === undefined) return undefined;
      const wire = parsePayload(errorLabPayloadSchema, raw, "ErrorLab");
      return mapWireToErrorLabPayload(wire);
    });
}
