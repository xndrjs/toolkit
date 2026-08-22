import { cmsEntryAri } from "../cms/index.js";
import { MenuShape, type Menu } from "../../domain/index.js";
import {
  flattenMenuEntryFields,
  MenuEntrySchema,
  parseEntryAsLinkField,
  type ContentfulEntryLink,
} from "../cms/generated/contentful.schemas.js";
import { mapAsset } from "./asset.mapper.js";
import { requireCmsEntry, type MapperContext } from "./mapper-context.js";

export function mapMenuLink(context: MapperContext, link: ContentfulEntryLink): Menu {
  return mapMenu(
    context,
    parseEntryAsLinkField(
      "page",
      "menu",
      requireCmsEntry(context, cmsEntryAri({ id: link.sys.id }))
    )
  );
}

export function mapMenu(context: MapperContext, raw: unknown): Menu {
  const entry = MenuEntrySchema.parse(raw);
  const fields = flattenMenuEntryFields(entry.fields, context.locale);
  if (!fields.logo) {
    throw new Error(`Menu ${entry.sys.id} is missing a required logo link`);
  }

  return MenuShape.create({
    type: "Menu",
    id: entry.sys.id,
    title: fields.title,
    logo: mapAsset(context, fields.logo),
  });
}
