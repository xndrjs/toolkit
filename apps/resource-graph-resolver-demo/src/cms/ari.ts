import { ari } from "@xndrjs/application-resources";

/** CMS Entry ARI — content-type is known only after resolve. */
export function cmsEntryAri(id: string) {
  return ari("cms.entry", { id });
}

/** CMS Asset ARI. */
export function cmsAssetAri(id: string) {
  return ari("cms.asset", { id });
}
