/**
 * Page-graph IR fixture inspired by the resource-graph-resolver demo /
 * package test graph (Page → hero/menu/footer/modules, Tab strips, Assets).
 *
 * Phase 1: multiplicity is always `"one"` — many-edges (`modules[]`, `strips[]`)
 * are represented as named one-expansions (`featuredTabs`, `stripHero`, …).
 * Islands are omitted (engine concern).
 */
import type { Program } from "../compile";

import {
  arg,
  construct,
  ctx,
  defScalar,
  expand,
  field,
  param,
  payload,
  prim,
  projection,
  query,
  resource,
  scalarRef,
  span,
} from "./ir-builders";

const Locale = scalarRef("Locale");
const PageId = scalarRef("PageId");
const HeroId = scalarRef("HeroId");
const MenuId = scalarRef("MenuId");
const FooterId = scalarRef("FooterId");
const AssetId = scalarRef("AssetId");
const TabsId = scalarRef("TabsId");
const TabId = scalarRef("TabId");
const ProductId = scalarRef("ProductId");
const Sku = scalarRef("Sku");

/**
 * Happy-path program: `query PageDetail` over a localized page graph.
 *
 * Type facts preserved for the checker:
 * - `@p.id : PageId`, `p.id : PageId`, `p.heroId : HeroId`
 * - `h.imageId : AssetId`, `tab.stripProductId : ProductId`
 * - locale always from `context.locale : Locale`
 */
export function pageDetailProgram(): Program {
  return {
    span,
    scalars: [
      defScalar("Locale", "string"),
      defScalar("PageId", "string"),
      defScalar("HeroId", "string"),
      defScalar("MenuId", "string"),
      defScalar("FooterId", "string"),
      defScalar("AssetId", "string"),
      defScalar("TabsId", "string"),
      defScalar("TabId", "string"),
      defScalar("ProductId", "string"),
      defScalar("Sku", "string"),
    ],
    resources: [
      resource(
        "Page",
        [field("id", PageId), field("locale", Locale)],
        [
          field("id", PageId, true),
          field("title", prim("string")),
          field("heroId", HeroId),
          field("menuId", MenuId),
          field("footerId", FooterId),
          field("featuredTabsId", TabsId),
        ]
      ),
      resource(
        "Hero",
        [field("id", HeroId), field("locale", Locale)],
        [field("id", HeroId, true), field("title", prim("string")), field("imageId", AssetId)]
      ),
      resource(
        "Menu",
        [field("id", MenuId), field("locale", Locale)],
        [field("id", MenuId, true), field("title", prim("string")), field("logoId", AssetId)]
      ),
      resource(
        "Footer",
        [field("id", FooterId), field("locale", Locale)],
        [field("id", FooterId, true), field("title", prim("string")), field("logoId", AssetId)]
      ),
      resource(
        "Asset",
        [field("id", AssetId), field("locale", Locale)],
        [field("id", AssetId, true), field("url", prim("string")), field("title", prim("string"))]
      ),
      resource(
        "Tabs",
        [field("id", TabsId), field("locale", Locale)],
        [field("id", TabsId, true), field("title", prim("string")), field("firstTabId", TabId)]
      ),
      resource(
        "Tab",
        [field("id", TabId), field("locale", Locale)],
        [
          field("id", TabId, true),
          field("title", prim("string")),
          field("stripHeroId", HeroId),
          field("stripProductId", ProductId),
        ]
      ),
      resource(
        "Product",
        [field("id", ProductId), field("locale", Locale)],
        [field("id", ProductId, true), field("sku", Sku), field("title", prim("string"))]
      ),
    ],
    queries: [
      query("PageDetail", {
        parameters: [field("pageId", PageId)],
        context: [field("locale", Locale)],
        root: construct("Page", [arg("id", param("pageId")), arg("locale", ctx("locale"))]),
        projections: [
          projection(
            "Page",
            "p",
            ["id", "title"],
            [
              expand(
                "hero",
                construct("Hero", [arg("id", payload("p", "heroId")), arg("locale", ctx("locale"))])
              ),
              expand(
                "menu",
                construct("Menu", [arg("id", payload("p", "menuId")), arg("locale", ctx("locale"))])
              ),
              expand(
                "footer",
                construct("Footer", [
                  arg("id", payload("p", "footerId")),
                  arg("locale", ctx("locale")),
                ])
              ),
              expand(
                "featuredTabs",
                construct("Tabs", [
                  arg("id", payload("p", "featuredTabsId")),
                  arg("locale", ctx("locale")),
                ])
              ),
            ]
          ),
          projection(
            "Hero",
            "h",
            ["id", "title"],
            [
              expand(
                "image",
                construct("Asset", [
                  arg("id", payload("h", "imageId")),
                  arg("locale", ctx("locale")),
                ])
              ),
            ]
          ),
          projection(
            "Menu",
            "m",
            ["id", "title"],
            [
              expand(
                "logo",
                construct("Asset", [
                  arg("id", payload("m", "logoId")),
                  arg("locale", ctx("locale")),
                ])
              ),
            ]
          ),
          projection(
            "Footer",
            "f",
            ["id", "title"],
            [
              expand(
                "logo",
                construct("Asset", [
                  arg("id", payload("f", "logoId")),
                  arg("locale", ctx("locale")),
                ])
              ),
            ]
          ),
          projection("Asset", "a", ["id", "url", "title"]),
          projection(
            "Tabs",
            "t",
            ["id", "title"],
            [
              expand(
                "firstTab",
                construct("Tab", [
                  arg("id", payload("t", "firstTabId")),
                  arg("locale", ctx("locale")),
                ])
              ),
            ]
          ),
          projection(
            "Tab",
            "tab",
            ["id", "title"],
            [
              expand(
                "stripHero",
                construct("Hero", [
                  arg("id", payload("tab", "stripHeroId")),
                  arg("locale", ctx("locale")),
                ])
              ),
              expand(
                "stripProduct",
                construct("Product", [
                  arg("id", payload("tab", "stripProductId")),
                  arg("locale", ctx("locale")),
                ])
              ),
            ]
          ),
          projection("Product", "prod", ["id", "sku", "title"]),
        ],
      }),
    ],
  };
}
