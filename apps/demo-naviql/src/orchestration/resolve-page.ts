import type { MissingResourceMode, SchedulingMode } from "@xndrjs/naviql";

import {
  pageAri,
  projectPageDetail,
  type Locale,
  type PageDetailResult,
  type PageId,
} from "../generated/page-detail.js";
import { createDemoResolver } from "../infrastructure/demo-resolver.js";
import { DEMO_LOCALE, demoIds } from "../infrastructure/fixtures/store.js";

const DEFAULT_SCHEDULING_MODE: SchedulingMode = "lane";

/** Route params that resolve against the in-memory fixture graph (`en-US`). */
export const DEMO_ROUTE_LOCALES = ["en", "en-US"] as const;

export type ResolvePageInput = {
  locale: Locale;
  pageId?: PageId;
  schedulingMode?: SchedulingMode;
  /** Defaults to `"throw"`; use `"collect"` for soft failures in the UI. */
  missingResourceMode?: MissingResourceMode;
  signal?: AbortSignal;
};

export type ResolvePageMeta = {
  locale: Locale;
  pageId: PageId;
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
    pageId: PageId;
    schedulingMode: SchedulingMode;
    resolvedCount?: number;
  };
  errors: readonly { resourceKey: string; message: string }[];
};

export type ResolvePageResult = ResolvePageSuccess | ResolvePageFailure;

/**
 * Vertical-slice path: resolver → ContentMap → `projectPageDetail`.
 *
 * Apps still call `resolve` themselves; this is handwritten glue only.
 */
export async function resolvePage(input: ResolvePageInput): Promise<ResolvePageResult> {
  const locale = input.locale;
  const pageId = (input.pageId ?? (demoIds.page as PageId)) as PageId;
  const schedulingMode = input.schedulingMode ?? DEFAULT_SCHEDULING_MODE;
  const missingResourceMode = input.missingResourceMode ?? "throw";
  const params = { pageId };
  const executionContext = { locale };
  const root = pageAri({ id: pageId, locale });

  const resolver = createDemoResolver({ params, schedulingMode });

  try {
    const { contentMap, errors } = await resolver.resolve({
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
          schedulingMode,
          resolvedCount: contentMap.size,
        },
        errors: errors.map(({ resourceKey, message }) => ({ resourceKey, message })),
      };
    }

    const page = projectPageDetail(root, contentMap, {
      params,
      executionContext,
    });

    return {
      ok: true,
      page,
      meta: {
        locale,
        pageId,
        schedulingMode,
        resolvedCount: contentMap.size,
      },
    };
  } catch (error) {
    return {
      ok: false,
      meta: { locale, pageId, schedulingMode },
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
