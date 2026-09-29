import {
  Scalars,
  type EntryId,
  type EnvironmentId,
  type Locale,
  type PageDetailResult,
  type SpaceId,
} from "../generated";
import { resolveDemoPageDetail } from "../infrastructure/demo-resolver.js";
import {
  DEMO_ENVIRONMENT,
  DEMO_LOCALE,
  DEMO_SPACE,
  demoIds,
} from "../infrastructure/fixtures/store.js";
import type { IslandMap, SchedulingMode } from "@xndrjs/ziel";

const DEFAULT_SCHEDULING_MODE: SchedulingMode = "lane";

/** Route params that resolve against the in-memory fixture graph (`en-US`). */
export const DEMO_ROUTE_LOCALES = ["en", "en-US"] as const;

export type ResolvePageInput = {
  locale: Locale;
  pageId?: EntryId;
  spaceId?: SpaceId;
  environmentId?: EnvironmentId;
  schedulingMode?: SchedulingMode;
  signal?: AbortSignal;
};

export type ResolvePageMeta = {
  locale: Locale;
  islands?: IslandMap;
  pageId: EntryId;
  spaceId: SpaceId;
  environmentId: EnvironmentId;
  schedulingMode: SchedulingMode;
  resolvedCount: number;
};

export type ResolvePageSuccess = {
  ok: true;
  page: PageDetailResult;
  /** Soft failures (`set null` / `set error`) collected during resolve. */
  errors: readonly { resourceKey: string; message: string; code?: string }[];
  meta: ResolvePageMeta;
};

export type ResolvePageFailure = {
  ok: false;
  meta: {
    locale: Locale;
    pageId: EntryId;
    spaceId: SpaceId;
    environmentId: EnvironmentId;
    schedulingMode: SchedulingMode;
    resolvedCount?: number;
  };
  errors: readonly { resourceKey: string; message: string; code?: string }[];
};

export type ResolvePageResult = ResolvePageSuccess | ResolvePageFailure;

/**
 * Vertical-slice path via generated `resolvePageDetail`
 * (closed strategy → resolve → project) + demo DataSources.
 * Soft policies (`set null` / `set error`) return `ok: true` even when
 * `errors` is non-empty; only thrown hard failures become `ok: false`.
 */
export async function resolvePage(input: ResolvePageInput): Promise<ResolvePageResult> {
  const locale = input.locale;
  const pageId = input.pageId ?? Scalars.EntryId(demoIds.page);
  const spaceId = input.spaceId ?? DEMO_SPACE;
  const environmentId = input.environmentId ?? DEMO_ENVIRONMENT;
  const schedulingMode = input.schedulingMode ?? DEFAULT_SCHEDULING_MODE;
  const params = { pageId };
  const executionContext = { spaceId, environmentId, locale };

  try {
    const { pageDetail, contentMap, errors, islands } = await resolveDemoPageDetail({
      params,
      schedulingMode,
      executionContext,
      signal: input.signal,
    });

    return {
      ok: true,
      page: pageDetail,
      errors: errors.map((error) => ({
        resourceKey: error.resourceKey ?? "",
        message: error.message,
        ...(error.code !== undefined ? { code: String(error.code) } : {}),
      })),
      meta: {
        islands,
        locale,
        pageId,
        spaceId,
        environmentId,
        schedulingMode,
        resolvedCount: contentMap.size,
      },
    };
  } catch (error) {
    return {
      ok: false,
      meta: { locale, pageId, spaceId, environmentId, schedulingMode },
      errors: [
        {
          resourceKey: `page/${pageId}`,
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

/** Map `/en` or `/en-US` onto the fixture locale (`en-US`). */
export function parseDemoLocaleParam(param: string): Locale | null {
  if ((DEMO_ROUTE_LOCALES as readonly string[]).includes(param)) {
    return DEMO_LOCALE;
  }
  return null;
}
