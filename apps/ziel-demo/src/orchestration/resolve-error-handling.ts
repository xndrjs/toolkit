import type { SchedulingMode } from "@xndrjs/ziel";

import {
  type EntryId,
  type EnvironmentId,
  type Locale,
  type ResolveErrorHandlingDetailResult,
  type SpaceId,
} from "../generated";
import { resolveDemoErrorHandlingDetail } from "../composition/demo-sources.js";
import {
  DEMO_ENVIRONMENT,
  DEMO_LOCALE,
  DEMO_SPACE,
  demoIds,
} from "../infrastructure/fixtures/cms-store.js";
import { ERROR_HANDLING_CASES, type ErrorHandlingCaseId } from "./error-handling-cases.js";

const DEFAULT_SCHEDULING_MODE: SchedulingMode = "lane";

const CASE_IDS = new Set<string>(ERROR_HANDLING_CASES.map((c) => c.id));

export function isErrorHandlingCaseId(id: string): id is ErrorHandlingCaseId {
  return CASE_IDS.has(id);
}

export type ResolveErrorHandlingInput = {
  labId: EntryId;
  locale?: Locale;
  spaceId?: SpaceId;
  environmentId?: EnvironmentId;
  schedulingMode?: SchedulingMode;
  signal?: AbortSignal;
};

export type ResolveErrorHandlingContext = {
  locale: Locale;
  labId: EntryId;
  spaceId: SpaceId;
  environmentId: EnvironmentId;
  schedulingMode: SchedulingMode;
};

/** Raw Ziel resolve output + demo defaults applied as `context`. Throws on hard failure. */
export type ResolveErrorHandlingResult = ResolveErrorHandlingDetailResult & {
  context: ResolveErrorHandlingContext;
};

/**
 * Resolve an ErrorLab showcase root.
 * Soft policies leave `errors` non-empty; hard `throw` policies propagate.
 */
export async function resolveErrorHandling(
  input: ResolveErrorHandlingInput
): Promise<ResolveErrorHandlingResult> {
  const locale = input.locale ?? DEMO_LOCALE;
  const labId = input.labId;
  const spaceId = input.spaceId ?? DEMO_SPACE;
  const environmentId = input.environmentId ?? DEMO_ENVIRONMENT;
  const schedulingMode = input.schedulingMode ?? DEFAULT_SCHEDULING_MODE;

  const resolved = await resolveDemoErrorHandlingDetail({
    params: { labId },
    schedulingMode,
    executionContext: { spaceId, environmentId, locale },
    signal: input.signal,
  });

  return {
    ...resolved,
    context: { locale, labId, spaceId, environmentId, schedulingMode },
  };
}

/** Default case when the route id is unknown. */
export const DEFAULT_ERROR_HANDLING_CASE_ID = demoIds.ehSoftSingle;
