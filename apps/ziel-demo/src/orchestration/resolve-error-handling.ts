import type { IslandMap, ResolutionError, SchedulingMode } from "@xndrjs/ziel";

import {
  Scalars,
  type EntryId,
  type EnvironmentId,
  type ErrorHandlingDetailResult,
  type Locale,
  type SpaceId,
} from "../generated";
import { resolveDemoErrorHandlingDetail } from "../infrastructure/demo-resolver.js";
import {
  DEMO_ENVIRONMENT,
  DEMO_LOCALE,
  DEMO_SPACE,
  ERROR_HANDLING_CASES,
  type ErrorHandlingCaseId,
  demoIds,
} from "../infrastructure/fixtures/store.js";

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

export type ResolveErrorHandlingMeta = {
  locale: Locale;
  labId: EntryId;
  spaceId: SpaceId;
  environmentId: EnvironmentId;
  schedulingMode: SchedulingMode;
  resolvedCount: number;
  islands?: IslandMap;
};

export type ResolveErrorHandlingSuccess = {
  ok: true;
  lab: ErrorHandlingDetailResult;
  /**
   * Soft failures (`set null` / `set error`) collected during resolve.
   * Projection still succeeded; inspect aliases for local `null` / `ResolutionError`.
   */
  errors: readonly { resourceKey: string; message: string; code?: string }[];
  meta: ResolveErrorHandlingMeta;
};

export type ResolveErrorHandlingFailure = {
  ok: false;
  meta: {
    locale: Locale;
    labId: EntryId;
    spaceId: SpaceId;
    environmentId: EnvironmentId;
    schedulingMode: SchedulingMode;
    resolvedCount?: number;
  };
  errors: readonly { resourceKey: string; message: string; code?: string }[];
};

export type ResolveErrorHandlingResult = ResolveErrorHandlingSuccess | ResolveErrorHandlingFailure;

function serializeErrors(
  errors: readonly ResolutionError[]
): { resourceKey: string; message: string; code?: string }[] {
  return errors.map((error) => ({
    resourceKey: error.resourceKey ?? "",
    message: error.message,
    ...(error.code !== undefined ? { code: String(error.code) } : {}),
  }));
}

/**
 * Resolve an ErrorLab showcase root.
 * Soft policies (`set null` / `set error`) return `ok: true` even when
 * `errors` is non-empty; only thrown hard failures become `ok: false`.
 */
export async function resolveErrorHandling(
  input: ResolveErrorHandlingInput
): Promise<ResolveErrorHandlingResult> {
  const locale = input.locale ?? DEMO_LOCALE;
  const labId = input.labId;
  const spaceId = input.spaceId ?? DEMO_SPACE;
  const environmentId = input.environmentId ?? DEMO_ENVIRONMENT;
  const schedulingMode = input.schedulingMode ?? DEFAULT_SCHEDULING_MODE;
  const params = { labId };
  const executionContext = { spaceId, environmentId, locale };

  try {
    const { errorHandlingDetail, contentMap, errors, islands } =
      await resolveDemoErrorHandlingDetail({
        params,
        schedulingMode,
        executionContext,
        signal: input.signal,
      });

    return {
      ok: true,
      lab: errorHandlingDetail,
      errors: serializeErrors(errors),
      meta: {
        islands,
        locale,
        labId,
        spaceId,
        environmentId,
        schedulingMode,
        resolvedCount: contentMap.size,
      },
    };
  } catch (error) {
    return {
      ok: false,
      meta: { locale, labId, spaceId, environmentId, schedulingMode },
      errors: [
        {
          resourceKey: `ErrorLab/${labId}`,
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

/** Default case when the route id is unknown. */
export const DEFAULT_ERROR_HANDLING_CASE_ID = demoIds.ehSoftSingle;
