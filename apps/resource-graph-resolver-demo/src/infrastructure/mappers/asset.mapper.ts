import { cmsAssetAri } from "../cms/index.js";
import { AssetShape, type Asset } from "../../domain/index.js";
import type { ContentfulAssetLink } from "../cms/generated/contentful.schemas.js";
import type { MapperContext } from "./mapper-context.js";

export function mapAsset(context: MapperContext, link: ContentfulAssetLink): Asset {
  const raw = context.result.contentMap.get(
    cmsAssetAri({ id: link.sys.id, locale: context.locale })
  );
  if (!raw) {
    throw new Error(`ContentMap is missing cms.asset ${link.sys.id}`);
  }

  const file = raw.fields.file;
  if (!file) {
    throw new Error(`ContentMap cms.asset ${link.sys.id} is missing fields.file`);
  }

  return AssetShape.create({
    type: "Asset",
    id: raw.sys.id,
    url: file.url,
    title: raw.fields.title ?? null,
  });
}
