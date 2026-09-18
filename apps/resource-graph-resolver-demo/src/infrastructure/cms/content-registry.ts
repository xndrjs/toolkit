import type {
  ContentfulAsset,
  ContentfulResolvedLocalizedEntry,
} from "./generated/contentful.schemas.js";

/** ContentRegistry slice owned by the CMS source adapter. */
export type CmsContentRegistry = {
  "cms.entry": ContentfulResolvedLocalizedEntry;
  "cms.asset": ContentfulAsset;
};
