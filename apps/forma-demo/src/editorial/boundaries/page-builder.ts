import { boundary } from "@xndrjs/forma";

export type PagePath = { readonly pathname: string };
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

/** PageBuilder-owned seam: similar to Routing.ResolvePath, but not a synonym. */
export const ResolvePage = PageBuilder.intent("resolvePage").contract<
  PagePath,
  PageLocation,
  PageResolutionError
>();

export const CreatePagePreviewUseCase = PageBuilder.intent("createPagePreviewUseCase").contract<
  PagePath,
  PagePreview,
  PageResolutionError
>();

export const CreatePagePreviewProvider = CreatePagePreviewUseCase.provide
  .using({ resolvePage: ResolvePage })
  .with(({ deps: { resolvePage }, out }) => {
    return async function createPagePreview(path) {
      const outcome = await resolvePage(path);
      switch (outcome.kind) {
        case "success":
          return out.success({
            pageId: outcome.value.id,
            canonicalPath: outcome.value.canonicalPath,
            previewUrl: `/preview/${encodeURIComponent(outcome.value.id)}`,
          });
        case "expectedError":
          return out.expectedError(outcome.error);
        default:
          return outcome;
      }
    };
  });
