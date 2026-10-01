import type { ResourceLoadContext } from "@xndrjs/ziel";

import {
  productMediaAri,
  type MediaCdnContext,
  type ProductMediaPayload,
  type ProductMediaResource,
} from "../../generated";
import { demoMedia } from "../fixtures/commerce-store.js";
import type { ProductMediaPayloadWire } from "./schemas/product-media.js";
import { parsePayload } from "../schemas/parse-payload.js";
import { mapWireToProductMediaPayload } from "./mappers/index.js";
import { productMediaPayloadSchema } from "./schemas/index.js";

export function loadProductMedia(media: ReadonlyMap<string, ProductMediaPayloadWire> = demoMedia) {
  return async (
    batch: readonly ProductMediaResource[],
    _context: ResourceLoadContext<MediaCdnContext>
  ): Promise<readonly (ProductMediaPayload | undefined)[]> =>
    batch.map((resource) => {
      if (!productMediaAri.matches(resource)) {
        return undefined;
      }
      const { id } = resource.key[0];
      const raw = media.get(id);
      return raw === undefined
        ? undefined
        : mapWireToProductMediaPayload(
            parsePayload(productMediaPayloadSchema, raw, "ProductMedia")
          );
    });
}
