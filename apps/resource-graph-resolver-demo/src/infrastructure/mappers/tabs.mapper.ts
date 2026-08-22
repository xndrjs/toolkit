import { TabsShape, type Tabs } from "../../domain/index.js";
import { flattenTabsEntryFields, TabsEntrySchema } from "../cms/generated/contentful.schemas.js";
import { mapTabLink } from "./tab.mapper.js";
import type { MapperContext } from "./mapper-context.js";

export function mapTabs(context: MapperContext, raw: unknown): Tabs {
  const entry = TabsEntrySchema.parse(raw);
  const fields = flattenTabsEntryFields(entry.fields, context.locale);
  const tabs = (fields.tabs ?? []).map((link) => mapTabLink(context, link));

  return TabsShape.create({
    type: "Tabs",
    id: entry.sys.id,
    title: fields.title,
    tabs,
  });
}
