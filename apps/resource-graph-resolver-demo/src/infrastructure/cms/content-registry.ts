import type { ContentfulAsset, ContentfulResolvedEntry } from "./generated/contentful.schemas.js";

/** ContentRegistry slice owned by the CMS source adapter. */
export type CmsContentRegistry = {
  "cms.entry": ContentfulResolvedEntry;
  "cms.asset": ContentfulAsset;
};
