import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import {
  serializeIsland,
  type ResolveContentGraphOutput,
  type SerializedIsland,
} from "@xndrjs/resource-graph-resolver";

import { cmsAssetAri, cmsEntryAri } from "./cms/index.js";
import type { DemoContentRegistry } from "./content-registry.js";
import { integrationProductAri } from "./integration/index.js";
import {
  AssetShape,
  FooterShape,
  HeroShape,
  MenuShape,
  PageShape,
  ProductShape,
  TabShape,
  TabsShape,
  type Asset,
  type Footer,
  type Hero,
  type Menu,
  type Page,
  type PageModule,
  type Product,
  type Tab,
  type TabStrip,
  type Tabs,
} from "../domain/index.js";
import {
  CONTENTFUL_DEFAULT_LOCALE,
  flattenFooterEntryFields,
  flattenHeroEntryFields,
  flattenMenuEntryFields,
  flattenPageEntryFields,
  flattenProductEntryFields,
  flattenTabEntryFields,
  flattenTabsEntryFields,
  FooterEntrySchema,
  HeroEntrySchema,
  MenuEntrySchema,
  PageEntrySchema,
  parseEntryAsLinkField,
  ProductEntrySchema,
  TabEntrySchema,
  TabsEntrySchema,
  type ContentfulAssetLink,
  type ContentfulEntryLink,
  type ContentfulLocaleCode,
} from "./cms/generated/contentful.schemas.js";

export type AggregatePageGraphInput = {
  /** Output of `ResolveContentGraphEngine.execute` (ContentMap + islands). */
  result: ResolveContentGraphOutput<DemoContentRegistry>;
  /** Root page CMS entry ARI. */
  root: ApplicationResourceIdentifier<"cms.entry">;
  locale?: ContentfulLocaleCode;
  /**
   * When true, also materialize raw CMS island payloads via `serializeIsland`
   * (page + dependent menu/footer) for cache invalidation.
   */
  includeSerializedIslands?: boolean;
};

export type AggregatedSerializedIslands = {
  page: SerializedIsland;
  menu?: SerializedIsland;
  footer?: SerializedIsland;
};

export type AggregatePageGraphResult = {
  page: Page;
  serializedIslands?: AggregatedSerializedIslands;
};

/**
 * Walks a resolved ContentMap from the page root and hydrates CMS + integration
 * payloads into domain-zod shapes. Commercial product data is already in the
 * ContentMap under `integration.product` (resolved by the data gateway).
 *
 * First implementation lives in the demo app only (schema-specific; not promoted to the library).
 */
export function aggregatePageGraph(input: AggregatePageGraphInput): AggregatePageGraphResult {
  const visitor = new DemoContentGraphVisitor(
    input.result,
    input.locale ?? CONTENTFUL_DEFAULT_LOCALE
  );

  const page = visitor.aggregatePage(input.root);

  if (!input.includeSerializedIslands) {
    return { page };
  }

  return {
    page,
    serializedIslands: visitor.serializeIslands(input.root),
  };
}

/**
 * App ContentGraphVisitor: content-type parse → locale flatten → domain shape,
 * with polymorphic link narrowing via `parseEntryAsLinkField`.
 * Reads only from ContentMap — no integration port.
 */
export class DemoContentGraphVisitor {
  constructor(
    private readonly result: ResolveContentGraphOutput<DemoContentRegistry>,
    private readonly locale: ContentfulLocaleCode
  ) {}

  aggregatePage(root: ApplicationResourceIdentifier<"cms.entry">): Page {
    const raw = this.requireCmsEntry(root);
    const entry = PageEntrySchema.parse(raw);
    const fields = flattenPageEntryFields(entry.fields, this.locale);

    if (fields.title === null || fields.title.length === 0) {
      throw new Error(`Page ${entry.sys.id} is missing a title for locale ${this.locale}`);
    }

    const modules: PageModule[] = [];
    for (const link of fields.modules ?? []) {
      modules.push(this.hydratePageModule(link));
    }

    return PageShape.create({
      type: "Page",
      id: entry.sys.id,
      title: fields.title,
      modules,
      menu: fields.menu ? this.hydrateMenuLink(fields.menu) : null,
      footer: fields.footer ? this.hydrateFooterLink(fields.footer) : null,
    });
  }

  serializeIslands(root: ApplicationResourceIdentifier<"cms.entry">): AggregatedSerializedIslands {
    const pageKey = root.format();
    const serialized: AggregatedSerializedIslands = {
      page: serializeIsland(pageKey, this.result),
    };

    for (const dep of this.result.islandDependencies.get(pageKey)) {
      const payload = this.result.contentMap.getByKey(dep);
      const contentTypeId =
        payload &&
        typeof payload === "object" &&
        "sys" in payload &&
        typeof (payload as { sys?: { contentType?: { sys?: { id?: unknown } } } }).sys?.contentType
          ?.sys?.id === "string"
          ? (payload as { sys: { contentType: { sys: { id: string } } } }).sys.contentType.sys.id
          : undefined;

      if (contentTypeId === "menu") {
        serialized.menu = serializeIsland(dep, this.result);
      } else if (contentTypeId === "footer") {
        serialized.footer = serializeIsland(dep, this.result);
      }
    }

    return serialized;
  }

  private hydratePageModule(link: ContentfulEntryLink): PageModule {
    const raw = this.requireCmsEntry(cmsEntryAri({ id: link.sys.id }));
    const entry = parseEntryAsLinkField("page", "modules", raw);
    const contentTypeId = entry.sys.contentType.sys.id;
    if (contentTypeId === "tabs") {
      return this.hydrateTabs(entry);
    }
    if (contentTypeId === "hero") {
      return this.hydrateHero(entry);
    }
    if (contentTypeId === "product") {
      return this.hydrateProduct(entry);
    }
    throw new Error(`Unsupported page module content type: ${String(contentTypeId)}`);
  }

  private hydrateTabs(raw: unknown): Tabs {
    const entry = TabsEntrySchema.parse(raw);
    const fields = flattenTabsEntryFields(entry.fields, this.locale);
    const tabs: Tab[] = [];
    for (const link of fields.tabs ?? []) {
      tabs.push(this.hydrateTabLink(link));
    }

    return TabsShape.create({
      type: "Tabs",
      id: entry.sys.id,
      title: fields.title,
      tabs,
    });
  }

  private hydrateTabLink(link: ContentfulEntryLink): Tab {
    return this.hydrateTab(
      parseEntryAsLinkField("tabs", "tabs", this.requireCmsEntry(cmsEntryAri({ id: link.sys.id })))
    );
  }

  private hydrateTab(raw: unknown): Tab {
    const entry = TabEntrySchema.parse(raw);
    const fields = flattenTabEntryFields(entry.fields, this.locale);
    if (fields.title === null || fields.title.length === 0) {
      throw new Error(`Tab ${entry.sys.id} is missing a title for locale ${this.locale}`);
    }

    const strips: TabStrip[] = [];
    for (const link of fields.strips ?? []) {
      strips.push(this.hydrateTabStrip(link));
    }

    return TabShape.create({
      type: "Tab",
      id: entry.sys.id,
      title: fields.title,
      strips,
    });
  }

  private hydrateTabStrip(link: ContentfulEntryLink): TabStrip {
    const raw = this.requireCmsEntry(cmsEntryAri({ id: link.sys.id }));
    const entry = parseEntryAsLinkField("tab", "strips", raw);
    const contentTypeId = entry.sys.contentType.sys.id;
    if (contentTypeId === "hero") {
      return this.hydrateHero(entry);
    }
    if (contentTypeId === "product") {
      return this.hydrateProduct(entry);
    }
    throw new Error(`Unsupported tab strip content type: ${String(contentTypeId)}`);
  }

  private hydrateHero(raw: unknown): Hero {
    const entry = HeroEntrySchema.parse(raw);
    const fields = flattenHeroEntryFields(entry.fields, this.locale);
    if (!fields.image) {
      throw new Error(`Hero ${entry.sys.id} is missing a required image link`);
    }

    return HeroShape.create({
      type: "Hero",
      id: entry.sys.id,
      title: fields.title,
      image: this.hydrateAsset(fields.image),
    });
  }

  private hydrateProduct(raw: unknown): Product {
    const entry = ProductEntrySchema.parse(raw);
    const fields = flattenProductEntryFields(entry.fields, this.locale);
    if (fields.sku === null || fields.sku.length === 0) {
      throw new Error(`Product ${entry.sys.id} is missing sku`);
    }
    if (fields.title === null || fields.title.length === 0) {
      throw new Error(`Product ${entry.sys.id} is missing a title for locale ${this.locale}`);
    }

    const commercial = this.result.contentMap.get(integrationProductAri({ sku: fields.sku }));
    if (!commercial) {
      throw new Error(
        `ContentMap is missing integration.product for sku ${fields.sku} (entry ${entry.sys.id})`
      );
    }

    return ProductShape.create({
      type: "Product",
      id: entry.sys.id,
      sku: fields.sku,
      title: fields.title,
      description: fields.description,
      price: {
        type: "Price",
        amount: commercial.price.amount,
        currency: commercial.price.currency,
      },
      availability: commercial.inStock,
    });
  }

  private hydrateMenuLink(link: ContentfulEntryLink): Menu {
    return this.hydrateMenu(
      parseEntryAsLinkField("page", "menu", this.requireCmsEntry(cmsEntryAri({ id: link.sys.id })))
    );
  }

  private hydrateMenu(raw: unknown): Menu {
    const entry = MenuEntrySchema.parse(raw);
    const fields = flattenMenuEntryFields(entry.fields, this.locale);
    if (!fields.logo) {
      throw new Error(`Menu ${entry.sys.id} is missing a required logo link`);
    }

    return MenuShape.create({
      type: "Menu",
      id: entry.sys.id,
      title: fields.title,
      logo: this.hydrateAsset(fields.logo),
    });
  }

  private hydrateFooterLink(link: ContentfulEntryLink): Footer {
    return this.hydrateFooter(
      parseEntryAsLinkField(
        "page",
        "footer",
        this.requireCmsEntry(cmsEntryAri({ id: link.sys.id }))
      )
    );
  }

  private hydrateFooter(raw: unknown): Footer {
    const entry = FooterEntrySchema.parse(raw);
    const fields = flattenFooterEntryFields(entry.fields, this.locale);
    if (!fields.logo) {
      throw new Error(`Footer ${entry.sys.id} is missing a required logo link`);
    }

    return FooterShape.create({
      type: "Footer",
      id: entry.sys.id,
      title: fields.title,
      logo: this.hydrateAsset(fields.logo),
    });
  }

  private hydrateAsset(link: ContentfulAssetLink): Asset {
    const raw = this.result.contentMap.get(cmsAssetAri({ id: link.sys.id }));
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

  private requireCmsEntry(resource: ApplicationResourceIdentifier<"cms.entry">) {
    const raw = this.result.contentMap.get(resource);
    if (!raw) {
      throw new Error(`ContentMap is missing cms.entry ${resource.format()}`);
    }
    return raw;
  }
}
