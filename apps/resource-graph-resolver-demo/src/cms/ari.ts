import { defineAri, s } from "@xndrjs/application-resources";

/** CMS Entry ARI — content-type is known only after resolve. */
export const cmsEntryAri = defineAri("cms.entry", s.tuple([s.object({ id: s.string() })]));

/** CMS Asset ARI. */
export const cmsAssetAri = defineAri("cms.asset", s.tuple([s.object({ id: s.string() })]));
