import type { SchedulingMode } from "@xndrjs/ziel";

import type { ResolveProductDetailResult } from "../generated/product-detail.query";
import type { CatalogProductId, Locale, Market, TenantId } from "../generated/resources";
import { resolveDemoProductDetail } from "../composition/demo-sources.js";
import {
  DEMO_MARKET,
  DEMO_PRODUCT_ID,
  DEMO_TENANT,
} from "../infrastructure/fixtures/commerce-store.js";
import { DEMO_LOCALE } from "../infrastructure/fixtures/cms-store.js";

const DEFAULT_SCHEDULING_MODE: SchedulingMode = "lane";

export type ResolveProductInput = {
  productId?: CatalogProductId;
  market?: Market;
  locale?: Locale;
  tenantId?: TenantId;
  schedulingMode?: SchedulingMode;
  signal?: AbortSignal;
};

export type ResolveProductContext = {
  locale: Locale;
  productId: CatalogProductId;
  market: Market;
  tenantId: TenantId;
  schedulingMode: SchedulingMode;
};

/** Raw Ziel resolve output + demo defaults applied as `context`. Throws on hard failure. */
export type ResolveProductResult = ResolveProductDetailResult & {
  context: ResolveProductContext;
};

/**
 * Vertical-slice path via generated `resolveProductDetail`
 * (closed strategy → resolve → project) + demo DataSources.
 * Soft policies leave `errors` non-empty; hard `throw` policies propagate.
 */
export async function resolveProduct(
  input: ResolveProductInput = {}
): Promise<ResolveProductResult> {
  const productId = input.productId ?? DEMO_PRODUCT_ID;
  const market = input.market ?? DEMO_MARKET;
  const locale = input.locale ?? DEMO_LOCALE;
  const tenantId = input.tenantId ?? DEMO_TENANT;
  const schedulingMode = input.schedulingMode ?? DEFAULT_SCHEDULING_MODE;

  const resolved = await resolveDemoProductDetail({
    params: { productId, market, locale, tenantId },
    schedulingMode,
    signal: input.signal,
  });

  return {
    ...resolved,
    context: { locale, productId, market, tenantId, schedulingMode },
  };
}

/** Map a route id onto the demo product when it matches the fixture catalog id. */
export function parseDemoProductIdParam(param: string): CatalogProductId | null {
  if (param === DEMO_PRODUCT_ID) {
    return DEMO_PRODUCT_ID;
  }
  return null;
}
