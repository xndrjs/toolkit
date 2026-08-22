import { cmsEntryAri } from "../cms/index.js";
import { TabShape, type Tab, type TabStrip } from "../../domain/index.js";
import {
  flattenTabEntryFields,
  parseEntryAsLinkField,
  TabEntrySchema,
  type ContentfulEntryLink,
} from "../cms/generated/contentful.schemas.js";
import { mapHero } from "./hero.mapper.js";
import { mapProduct } from "./product.mapper.js";
import { requireCmsEntry, type MapperContext } from "./mapper-context.js";

export function mapTabLink(context: MapperContext, link: ContentfulEntryLink): Tab {
  return mapTab(
    context,
    parseEntryAsLinkField(
      "tabs",
      "tabs",
      requireCmsEntry(context, cmsEntryAri({ id: link.sys.id }))
    )
  );
}

export function mapTab(context: MapperContext, raw: unknown): Tab {
  const entry = TabEntrySchema.parse(raw);
  const fields = flattenTabEntryFields(entry.fields, context.locale);
  if (fields.title === null || fields.title.length === 0) {
    throw new Error(`Tab ${entry.sys.id} is missing a title for locale ${context.locale}`);
  }

  const strips: TabStrip[] = [];
  for (const link of fields.strips ?? []) {
    strips.push(mapTabStrip(context, link));
  }

  return TabShape.create({
    type: "Tab",
    id: entry.sys.id,
    title: fields.title,
    strips,
  });
}

function mapTabStrip(context: MapperContext, link: ContentfulEntryLink): TabStrip {
  const raw = requireCmsEntry(context, cmsEntryAri({ id: link.sys.id }));
  const entry = parseEntryAsLinkField("tab", "strips", raw);
  const contentTypeId = entry.sys.contentType.sys.id;
  if (contentTypeId === "hero") {
    return mapHero(context, entry);
  }
  if (contentTypeId === "product") {
    return mapProduct(context, entry);
  }
  throw new Error(`Unsupported tab strip content type: ${String(contentTypeId)}`);
}
