import { TabsShape, type Tabs } from "../../domain/index.js";
import {
  flattenTabsLocalizedFields,
  TabsLocalizedEntrySchema,
} from "../cms/generated/contentful.schemas.js";
import { mapTabLink } from "./tab.mapper.js";
import type { MapperContext } from "./mapper-context.js";

export function mapTabs(context: MapperContext, raw: unknown): Tabs {
  const entry = TabsLocalizedEntrySchema.parse(raw);
  const fields = flattenTabsLocalizedFields(entry.fields, context.locale);
  const tabs = (fields.tabs ?? []).map((link) => mapTabLink(context, link));

  return TabsShape.create({
    type: "Tabs",
    id: entry.sys.id,
    title: fields.title,
    tabs,
  });
}
