import { demoIds } from "../infrastructure/fixtures/cms-store.js";

/** Case catalog for the error-handling demo routes. */
export const ERROR_HANDLING_CASES = [
  {
    id: demoIds.ehSoftSingle,
    label: "Single · set null",
    policy: "set null" as const,
    shape: "single" as const,
    hint: "Inspect softSingle in the projection — it should be null, with a matching entry in Errors.",
  },
  {
    id: demoIds.ehErrorSingle,
    label: "Single · set error",
    policy: "set error" as const,
    shape: "single" as const,
    hint: "Inspect errorSingle in the projection — it should be a ResolutionError, also listed in Errors.",
  },
  {
    id: demoIds.ehThrowSingle,
    label: "Single · throw",
    policy: "throw" as const,
    shape: "single" as const,
    hint: "throwSingle aborts resolve — no projection; only the hard-failure Errors panel is shown.",
  },
  {
    id: demoIds.ehSoftItems,
    label: "Array · set null",
    policy: "set null" as const,
    shape: "array" as const,
    hint: "Inspect softItems — the ok sibling stays; the missing slot is null, recorded in Errors.",
  },
  {
    id: demoIds.ehErrorItems,
    label: "Array · set error",
    policy: "set error" as const,
    shape: "array" as const,
    hint: "Inspect errorItems — the ok sibling stays; the missing slot is a ResolutionError in Errors too.",
  },
  {
    id: demoIds.ehThrowItems,
    label: "Array · throw",
    policy: "throw" as const,
    shape: "array" as const,
    hint: "throwItems aborts resolve — no projection; only the hard-failure Errors panel is shown.",
  },
] as const;

export type ErrorHandlingCaseId = (typeof ERROR_HANDLING_CASES)[number]["id"];
