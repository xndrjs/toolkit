import { boundary } from "@xndrjs/forma";

export type PageReference = { readonly pageId: string };
export type PageLocation = {
  readonly id: string;
  readonly canonicalPath: string;
};
export type PageResolutionError = { readonly code: "page_not_found" };
export type PagePreview = {
  readonly pageId: string;
  readonly canonicalPath: string;
  readonly previewUrl: string;
};

export const PageBuilder = boundary("page-builder");

/** PageBuilder-owned seam: narrower than Routing.ResolvePaths, but not a synonym. */
export const ResolvePage = PageBuilder.intent("resolvePage").contract<
  PageReference,
  PageLocation,
  PageResolutionError
>();

export const CreatePagePreviewUseCase = PageBuilder.intent("createPagePreviewUseCase").contract<
  PageReference,
  PagePreview,
  PageResolutionError
>();

export const CreatePagePreviewProvider = CreatePagePreviewUseCase.provide
  .using({ resolvePage: ResolvePage })
  .with(({ deps: { resolvePage }, out }) => {
    return async function createPagePreview(path) {
      const outcome = await resolvePage(path);
      return out.match(outcome, {
        success: (page) =>
          out.success({
            pageId: page.id,
            canonicalPath: page.canonicalPath,
            previewUrl: `/preview/${encodeURIComponent(page.id)}`,
          }),
        expectedError: {
          page_not_found: (error) => out.expectedError(error),
        },
      });
    };
  });
