import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import type { ResolveContentGraphOutput } from "@xndrjs/resource-graph-resolver";

import { cmsEntryAri } from "../cms/index.js";
import type { DemoContentRegistry } from "../content-registry.js";
import { PageShape, type Page, type PageModule } from "../../domain/index.js";
import {
  CONTENTFUL_DEFAULT_LOCALE,
  flattenPageEntryFields,
  PageEntrySchema,
  parseEntryAsLinkField,
  type ContentfulEntryLink,
  type ContentfulLocaleCode,
} from "../cms/generated/contentful.schemas.js";
import { mapFooterLink } from "./footer.mapper.js";
import { mapHero } from "./hero.mapper.js";
import { mapMenuLink } from "./menu.mapper.js";
import { mapProduct } from "./product.mapper.js";
import { mapTabs } from "./tabs.mapper.js";
import { requireCmsEntry, type MapperContext } from "./mapper-context.js";

export type MapContentMapToPageAggregateInput = {
  result: ResolveContentGraphOutput<DemoContentRegistry>;
  root: ApplicationResourceIdentifier<"cms.entry">;
  locale?: ContentfulLocaleCode;
};

/**
 * Walks a resolved ContentMap from the page root and maps CMS + integration
 * payloads into domain-zod shapes. Commercial product data is already in the
 * ContentMap under `integration.product` (resolved by the data gateway).
 */
export function mapContentMapToPageAggregate(input: MapContentMapToPageAggregateInput): Page {
  const context: MapperContext = {
    result: input.result,
    locale: input.locale ?? CONTENTFUL_DEFAULT_LOCALE,
  };

  const raw = requireCmsEntry(context, input.root);
  const entry = PageEntrySchema.parse(raw);
  const fields = flattenPageEntryFields(entry.fields, context.locale);

  if (fields.title === null || fields.title.length === 0) {
    throw new Error(`Page ${entry.sys.id} is missing a title for locale ${context.locale}`);
  }

  const modules: PageModule[] = [];
  for (const link of fields.modules ?? []) {
    modules.push(mapPageModule(context, link));
  }

  return PageShape.create({
    type: "Page",
    id: entry.sys.id,
    title: fields.title,
    modules,
    menu: fields.menu ? mapMenuLink(context, fields.menu) : null,
    footer: fields.footer ? mapFooterLink(context, fields.footer) : null,
  });
}

function mapPageModule(context: MapperContext, link: ContentfulEntryLink): PageModule {
  const raw = requireCmsEntry(context, cmsEntryAri({ id: link.sys.id }));
  const entry = parseEntryAsLinkField("page", "modules", raw);
  const contentTypeId = entry.sys.contentType.sys.id;
  if (contentTypeId === "tabs") {
    return mapTabs(context, entry);
  }
  if (contentTypeId === "hero") {
    return mapHero(context, entry);
  }
  if (contentTypeId === "product") {
    return mapProduct(context, entry);
  }
  throw new Error(`Unsupported page module content type: ${String(contentTypeId)}`);
}
