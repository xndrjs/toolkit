import { defineDataSourceFor, type DataSource } from "@xndrjs/naviql";

import {
  editorialModuleAri,
  footerAri,
  heroAri,
  menuAri,
  pageAri,
  tabAri,
  tabCollectionAri,
  tabsAri,
  type ContentRegistry,
  type EditorialModulePayload,
  type EditorialModuleResource,
  type FooterPayload,
  type FooterResource,
  type HeroPayload,
  type HeroResource,
  type MenuPayload,
  type MenuResource,
  type PageDetailExecutionContext,
  type PagePayload,
  type PageResource,
  type TabCollectionPayload,
  type TabCollectionResource,
  type TabPayload,
  type TabResource,
  type TabsPayload,
  type TabsResource,
} from "../../generated/page-detail.js";
import { demoFixtureStore } from "../fixtures/store.js";

export const CMS_SOURCE_ID = "cms";

type CmsRecord =
  | { resource: PageResource; payload: PagePayload }
  | { resource: HeroResource; payload: HeroPayload }
  | { resource: MenuResource; payload: MenuPayload }
  | { resource: FooterResource; payload: FooterPayload }
  | { resource: TabsResource; payload: TabsPayload }
  | { resource: TabResource; payload: TabPayload }
  | { resource: TabCollectionResource; payload: TabCollectionPayload }
  | { resource: EditorialModuleResource; payload: EditorialModulePayload };

const defineCmsSource = defineDataSourceFor<ContentRegistry, PageDetailExecutionContext>();

/**
 * Editorial graph source: owns Page / Hero / Menu / Footer / Tabs / Tab /
 * TabCollection / EditorialModule.
 */
export function createCmsSource(
  store: ReadonlyMap<string, unknown> = demoFixtureStore
): DataSource<ContentRegistry, PageDetailExecutionContext> {
  return defineCmsSource({
    id: CMS_SOURCE_ID,
    for: [
      pageAri,
      heroAri,
      menuAri,
      footerAri,
      tabsAri,
      tabAri,
      tabCollectionAri,
      editorialModuleAri,
    ],
    async load(batch) {
      const records: CmsRecord[] = [];

      for (const resource of batch) {
        const payload = store.get(resource.toString());
        if (payload === undefined) {
          continue;
        }

        if (pageAri.matches(resource)) {
          records.push({ resource, payload: payload as PagePayload });
          continue;
        }
        if (heroAri.matches(resource)) {
          records.push({ resource, payload: payload as HeroPayload });
          continue;
        }
        if (menuAri.matches(resource)) {
          records.push({ resource, payload: payload as MenuPayload });
          continue;
        }
        if (footerAri.matches(resource)) {
          records.push({ resource, payload: payload as FooterPayload });
          continue;
        }
        if (tabsAri.matches(resource)) {
          records.push({ resource, payload: payload as TabsPayload });
          continue;
        }
        if (tabAri.matches(resource)) {
          records.push({ resource, payload: payload as TabPayload });
          continue;
        }
        if (tabCollectionAri.matches(resource)) {
          records.push({ resource, payload: payload as TabCollectionPayload });
          continue;
        }
        if (editorialModuleAri.matches(resource)) {
          records.push({ resource, payload: payload as EditorialModulePayload });
        }
      }

      return records;
    },
  });
}
