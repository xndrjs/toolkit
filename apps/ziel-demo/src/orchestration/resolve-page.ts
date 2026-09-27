import {
  pageAri,
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
import type { IslandMap, MissingResourceMode, SchedulingMode } from "@xndrjs/ziel";

const DEFAULT_SCHEDULING_MODE: SchedulingMode = "lane";

/** Route params that resolve against the in-memory fixture graph (`en-US`). */
export const DEMO_ROUTE_LOCALES = ["en", "en-US"] as const;

export type ResolvePageInput = {
  locale: Locale;
  pageId?: EntryId;
  spaceId?: SpaceId;
  environmentId?: EnvironmentId;
  schedulingMode?: SchedulingMode;
  /** Defaults to `"throw"`; use `"collect"` for soft failures in the UI. */
  missingResourceMode?: MissingResourceMode;
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
  errors: readonly { resourceKey: string; message: string }[];
};

export type ResolvePageResult = ResolvePageSuccess | ResolvePageFailure;

/**
 * Vertical-slice path via generated `resolvePageDetail`
 * (closed strategy → resolve → project) + demo DataSources.
 */
export async function resolvePage(input: ResolvePageInput): Promise<ResolvePageResult> {
  const locale = input.locale;
  const pageId = input.pageId ?? Scalars.EntryId(demoIds.page);
  const spaceId = input.spaceId ?? DEMO_SPACE;
  const environmentId = input.environmentId ?? DEMO_ENVIRONMENT;
  const schedulingMode = input.schedulingMode ?? DEFAULT_SCHEDULING_MODE;
  const missingResourceMode = input.missingResourceMode ?? "throw";
  const params = { pageId };
  const executionContext = { spaceId, environmentId, locale };
  const root = pageAri({ spaceId, environmentId, id: pageId, locale });

  try {
    const { pageDetail, contentMap, errors, islands } = await resolveDemoPageDetail({
      params,
      schedulingMode,
      root,
      executionContext,
      missingResourceMode,
      signal: input.signal,
    });

    if (errors.length > 0) {
      return {
        ok: false,
        meta: {
          locale,
          pageId,
          spaceId,
          environmentId,
          schedulingMode,
          resolvedCount: contentMap.size,
        },
        errors: errors.map(({ resourceKey, message }) => ({ resourceKey, message })),
      };
    }

    return {
      ok: true,
      page: pageDetail,
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
          resourceKey: root.toString(),
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
