/**
 * Page-graph IR fixture inspired by the resource-graph-resolver demo.
 *
 * - `resource Name(identity): payloadType` — identity before `:`, payload after.
 * - `TabCollection(...): Tab[]` — collection of resource instances (not value array).
 * - `Page.strips` / `Tab.strips`: Tabs | Hero | Product.
 * Collection member expansion into the graph / `on Tab` is a later runtime concern;
 * the IR preserves `array{ resourceRef("Tab") }` without lowering to plain objects.
 */
import type { Program } from "../compile";

import {
  arg,
  arrayOf,
  construct,
  ctx,
  defScalar,
  expand,
  field,
  objectType,
  param,
  payload,
  prim,
  projection,
  query,
  resource,
  resourceRef,
  scalarRef,
  span,
  strLit,
  union,
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

const ModuleStrip = union(
  objectType(field("type", strLit("Tabs")), field("id", TabsId)),
  objectType(field("type", strLit("Hero")), field("id", HeroId)),
  objectType(field("type", strLit("Product")), field("id", ProductId))
);

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
        objectType(
          field("id", PageId, true),
          field("title", prim("string")),
          field("heroId", HeroId),
          field("menuId", MenuId),
          field("footerId", FooterId),
          field("featuredTabsId", TabsId),
          field("strips", arrayOf(ModuleStrip))
        )
      ),
      resource(
        "Hero",
        [field("id", HeroId), field("locale", Locale)],
        objectType(
          field("id", HeroId, true),
          field("title", prim("string")),
          field("imageId", AssetId)
        )
      ),
      resource(
        "Menu",
        [field("id", MenuId), field("locale", Locale)],
        objectType(
          field("id", MenuId, true),
          field("title", prim("string")),
          field("logoId", AssetId)
        )
      ),
      resource(
        "Footer",
        [field("id", FooterId), field("locale", Locale)],
        objectType(
          field("id", FooterId, true),
          field("title", prim("string")),
          field("logoId", AssetId)
        )
      ),
      resource(
        "Asset",
        [field("id", AssetId), field("locale", Locale)],
        objectType(
          field("id", AssetId, true),
          field("url", prim("string")),
          field("title", prim("string")),
          field("kind", union(strLit("image"), strLit("video"), strLit("document")))
        )
      ),
      resource(
        "Tabs",
        [field("id", TabsId), field("locale", Locale)],
        objectType(field("id", TabsId, true), field("title", prim("string")))
      ),
      resource(
        "Tab",
        [field("id", TabId), field("locale", Locale)],
        objectType(
          field("id", TabId, true),
          field("title", prim("string")),
          field("stripHeroId", HeroId),
          field("stripProductId", ProductId),
          field("strips", arrayOf(ModuleStrip))
        )
      ),
      resource(
        "TabCollection",
        [field("tabsId", TabsId), field("locale", Locale)],
        arrayOf(resourceRef("Tab"))
      ),
      resource(
        "Product",
        [field("id", ProductId), field("locale", Locale)],
        objectType(field("id", ProductId, true), field("sku", Sku), field("title", prim("string")))
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
            ["id", "title", "strips"],
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
          projection("Asset", "a", ["id", "url", "title", "kind"]),
          projection(
            "Tabs",
            "t",
            ["id", "title"],
            [
              expand(
                "tabs",
                construct("TabCollection", [
                  arg("tabsId", payload("t", "id")),
                  arg("locale", ctx("locale")),
                ])
              ),
            ]
          ),
          projection(
            "Tab",
            "tab",
            ["id", "title", "strips"],
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
