import { defineAri, s } from "@xndrjs/application-resources";

export const cmsEntryAri = defineAri("cms.entry", s.object({ id: s.string() }));

export const cmsAssetAri = defineAri("cms.asset", s.object({ id: s.string() }));
