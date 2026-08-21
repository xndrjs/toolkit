import type { MockContentfulAsset, MockContentfulEntry } from "./mock-contentful-types.js";

/** ContentRegistry slice owned by the CMS source adapter. */
export type CmsContentRegistry = {
  "cms.entry": MockContentfulEntry;
  "cms.asset": MockContentfulAsset;
};
