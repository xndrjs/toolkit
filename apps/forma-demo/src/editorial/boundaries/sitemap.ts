import { boundary } from "@xndrjs/forma";

export type SitemapPath = { readonly path: string };
export type SitemapRouteMatch = {
  readonly pageId: string;
  readonly canonicalPath: string;
};
export type SitemapRouteError = { readonly code: "route_not_found" };
export type SitemapEntry = {
  readonly location: string;
  readonly pageId: string;
};

export const Sitemap = boundary("sitemap");

/** Historical seam kept temporarily while ownership moves to Routing. */
export const ResolveSitemapPath = Sitemap.intent("resolveSitemapPath").contract<
  SitemapPath,
  SitemapRouteMatch,
  SitemapRouteError
>();

export const GetSitemapEntryUseCase = Sitemap.intent("getSitemapEntryUseCase").contract<
  SitemapPath,
  SitemapEntry,
  SitemapRouteError
>();

export const GetSitemapEntryProvider = GetSitemapEntryUseCase.provide
  .using({ resolvePath: ResolveSitemapPath })
  .with(({ deps: { resolvePath }, out }) => {
    return async function getSitemapEntry(path) {
      const outcome = await resolvePath(path);
      switch (outcome.kind) {
        case "success":
          return out.success({
            location: outcome.value.canonicalPath,
            pageId: outcome.value.pageId,
          });
        case "expectedError":
          return out.expectedError(outcome.error);
        default:
          return outcome;
      }
    };
  });
