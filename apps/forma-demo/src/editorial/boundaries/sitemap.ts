import { boundary } from "@xndrjs/forma";

export type SitemapEntry = {
  readonly location: string;
  readonly lastModifiedAt: string;
};
export type GeneratedSitemap = {
  readonly entries: readonly SitemapEntry[];
};

export const Sitemap = boundary("sitemap");

/** Consumer-owned port. Its realization may come from Routing, a CMS, or another source. */
export const EnumerateSitemapEntries = Sitemap.intent("enumerateSitemapEntries").contract<
  void,
  readonly SitemapEntry[],
  never
>();

export const GenerateSitemapUseCase = Sitemap.intent("generateSitemapUseCase").contract<
  void,
  GeneratedSitemap,
  never
>();

export const GenerateSitemapProvider = GenerateSitemapUseCase.provide
  .using({ enumerateEntries: EnumerateSitemapEntries })
  .with(({ deps: { enumerateEntries }, out }) => {
    return async function generateSitemap() {
      const outcome = await enumerateEntries();
      switch (outcome.kind) {
        case "success":
          return out.success({ entries: outcome.value });
        default:
          return outcome;
      }
    };
  });
