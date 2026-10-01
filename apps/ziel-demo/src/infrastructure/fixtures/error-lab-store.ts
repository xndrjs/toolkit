/**
 * ErrorLab showcase fixtures as wire shapes (plain strings).
 * Served by `ErrorLabStore`, not `CmsEntries`.
 */
import type { ErrorLabPayloadWire } from "../cms/schemas/error-lab.js";
import { DEMO_ENVIRONMENT, DEMO_SPACE, demoIds, entryLookupKey } from "./cms-store.js";

/** Id used by error-handling labs for expands that should fail to load. */
export const MISSING_ENTRY_ID = "missing-entry";

const spaceId = DEMO_SPACE;
const environmentId = DEMO_ENVIRONMENT;

const okEntry = demoIds.heroWelcome;
const missingEntry = MISSING_ENTRY_ID;

function errorLabPayload(
  id: string,
  title: string,
  overrides: Partial<Omit<ErrorLabPayloadWire, "id" | "title">>
): ErrorLabPayloadWire {
  return {
    id,
    title,
    softSingleId: okEntry,
    errorSingleId: okEntry,
    throwSingleId: okEntry,
    softItems: [],
    errorItems: [],
    throwItems: [],
    ...overrides,
  };
}

/** ErrorLab showcase roots keyed by `space/environment/id`. */
export const demoErrorLabs: ReadonlyMap<string, ErrorLabPayloadWire> = new Map([
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.ehSoftSingle }),
    errorLabPayload(demoIds.ehSoftSingle, "Soft single (set null)", {
      softSingleId: missingEntry,
    }),
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.ehErrorSingle }),
    errorLabPayload(demoIds.ehErrorSingle, "Error single (set error)", {
      errorSingleId: missingEntry,
    }),
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.ehThrowSingle }),
    errorLabPayload(demoIds.ehThrowSingle, "Throw single", {
      throwSingleId: missingEntry,
    }),
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.ehSoftItems }),
    errorLabPayload(demoIds.ehSoftItems, "Soft items (set null)", {
      softItems: [{ id: okEntry }, { id: missingEntry }],
    }),
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.ehErrorItems }),
    errorLabPayload(demoIds.ehErrorItems, "Error items (set error)", {
      errorItems: [{ id: okEntry }, { id: missingEntry }],
    }),
  ],
  [
    entryLookupKey({ spaceId, environmentId, id: demoIds.ehThrowItems }),
    errorLabPayload(demoIds.ehThrowItems, "Throw items", {
      throwItems: [{ id: missingEntry }],
    }),
  ],
]);
