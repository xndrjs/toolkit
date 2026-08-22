import { cmsEntryAri } from "../cms/index.js";
import { FooterShape, type Footer } from "../../domain/index.js";
import {
  flattenFooterEntryFields,
  FooterEntrySchema,
  parseEntryAsLinkField,
  type ContentfulEntryLink,
} from "../cms/generated/contentful.schemas.js";
import { mapAsset } from "./asset.mapper.js";
import { requireCmsEntry, type MapperContext } from "./mapper-context.js";

export function mapFooterLink(context: MapperContext, link: ContentfulEntryLink): Footer {
  return mapFooter(
    context,
    parseEntryAsLinkField(
      "page",
      "footer",
      requireCmsEntry(context, cmsEntryAri({ id: link.sys.id, locale: context.locale }))
    )
  );
}

export function mapFooter(context: MapperContext, raw: unknown): Footer {
  const entry = FooterEntrySchema.parse(raw);
  const fields = flattenFooterEntryFields(entry.fields, context.locale);
  if (!fields.logo) {
    throw new Error(`Footer ${entry.sys.id} is missing a required logo link`);
  }

  return FooterShape.create({
    type: "Footer",
    id: entry.sys.id,
    title: fields.title,
    logo: mapAsset(context, fields.logo),
  });
}
