import type { ResourceLoadContext } from "@xndrjs/ziel";

import {
  productMediaAri,
  type MediaCdnContext,
  type ProductMediaPayload,
  type ProductMediaResource,
} from "../../generated";
import { demoMedia } from "../fixtures/commerce-store.js";

export function loadProductMedia(media: ReadonlyMap<string, ProductMediaPayload> = demoMedia) {
  return async (
    batch: readonly ProductMediaResource[],
    _context: ResourceLoadContext<MediaCdnContext>
  ): Promise<readonly (ProductMediaPayload | undefined)[]> =>
    batch.map((resource) => {
      if (!productMediaAri.matches(resource)) {
        return undefined;
      }
      const { id } = resource.key[0];
      return media.get(id);
    });
}
