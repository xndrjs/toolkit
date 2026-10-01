import type { SchedulingMode } from "@xndrjs/ziel";

import {
  Scalars,
  type EntryId,
  type EnvironmentId,
  type Locale,
  type ResolvePageDetailResult,
  type SpaceId,
} from "../generated";
import { resolveDemoPageDetail } from "../composition/demo-sources.js";
import {
  DEMO_ENVIRONMENT,
  DEMO_LOCALE,
  DEMO_SPACE,
  demoIds,
} from "../infrastructure/fixtures/cms-store.js";

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

export type ResolvePageContext = {
  locale: Locale;
  pageId: EntryId;
  spaceId: SpaceId;
  environmentId: EnvironmentId;
  schedulingMode: SchedulingMode;
};

/** Raw Ziel resolve output + demo defaults applied as `context`. Throws on hard failure. */
export type ResolvePageResult = ResolvePageDetailResult & {
  context: ResolvePageContext;
};

/**
 * Vertical-slice path via generated `resolvePageDetail`
 * (closed strategy → resolve → project) + demo DataSources.
 * Soft policies leave `errors` non-empty; hard `throw` policies propagate.
 */
export async function resolvePage(input: ResolvePageInput): Promise<ResolvePageResult> {
  const locale = input.locale;
  const pageId = input.pageId ?? Scalars.EntryId(demoIds.page);
  const spaceId = input.spaceId ?? DEMO_SPACE;
  const environmentId = input.environmentId ?? DEMO_ENVIRONMENT;
  const schedulingMode = input.schedulingMode ?? DEFAULT_SCHEDULING_MODE;

  const resolved = await resolveDemoPageDetail({
    params: { pageId, spaceId, environmentId, locale },
    schedulingMode,
    signal: input.signal,
  });

  return {
    ...resolved,
    context: { locale, pageId, spaceId, environmentId, schedulingMode },
  };
}

/** Map `/en` or `/en-US` onto the fixture locale (`en-US`). */
export function parseDemoLocaleParam(param: string): Locale | null {
  if ((DEMO_ROUTE_LOCALES as readonly string[]).includes(param)) {
    return DEMO_LOCALE;
  }
  return null;
}
