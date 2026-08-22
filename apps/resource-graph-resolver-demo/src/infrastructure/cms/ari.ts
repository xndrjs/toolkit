import { defineAri, s } from "@xndrjs/application-resources";

import { CONTENTFUL_LOCALE_CODES } from "./generated/contentful.schemas.js";

const localeKeySchema = s.enum(CONTENTFUL_LOCALE_CODES);

export const cmsEntryAri = defineAri(
  "cms.entry",
  s.object({ id: s.string(), locale: localeKeySchema })
);
export type CmsEntryResource = ReturnType<typeof cmsEntryAri>;

export const cmsAssetAri = defineAri(
  "cms.asset",
  s.object({ id: s.string(), locale: localeKeySchema })
);
export type CmsAssetResource = ReturnType<typeof cmsAssetAri>;
