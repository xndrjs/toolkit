/**
 * Demo-only ErrorLab source for the error-handling showcase.
 * Separate lane from CmsEntries — page-detail CMS loading never sees these roots.
 */
import type { ResourceLoadContext } from "@xndrjs/ziel";

import {
  errorLabAri,
  Scalars,
  type EntryId,
  type EnvironmentId,
  type ErrorLabPayload,
  type ErrorLabResource,
  type ErrorLabStoreContext,
  type Locale,
  type SpaceId,
} from "../../generated";
import { demoErrorLabs, entryLookupKey } from "../fixtures/store.js";

export const ERROR_LAB_SOURCE_ID = "ErrorLabStore";

type LabIdentity = {
  spaceId: SpaceId;
  environmentId: EnvironmentId;
  id: EntryId;
  locale: Locale;
};

function labIdentityOf(resource: { key: readonly unknown[] }): LabIdentity | null {
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

/** App `load` for the generated `ErrorLabStore` datasource. */
export function loadErrorLabStore(labs: ReadonlyMap<string, ErrorLabPayload> = demoErrorLabs) {
  return async (
    batch: readonly ErrorLabResource[],
    _context: ResourceLoadContext<ErrorLabStoreContext>
  ): Promise<readonly (ErrorLabPayload | undefined)[]> =>
    batch.map((resource) => {
      if (!errorLabAri.matches(resource)) {
        return undefined;
      }
      const identity = labIdentityOf(resource);
      if (identity === null) {
        return undefined;
      }
      return labs.get(
        entryLookupKey({
          spaceId: identity.spaceId,
          environmentId: identity.environmentId,
          id: identity.id,
        })
      );
    });
}
