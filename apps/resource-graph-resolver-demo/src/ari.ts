import { ari } from "@xndrjs/application-resources";

/** Opaque Entry ARI — content-type is known only after resolve. */
export function entryAri(id: string) {
  return ari("entry", { id });
}

/** Opaque Asset ARI. */
export function assetAri(id: string) {
  return ari("asset", { id });
}
