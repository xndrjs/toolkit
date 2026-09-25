/**
 * Page-graph IR fixture inspired by the resource-graph-resolver demo.
 *
 * - `Page.strips` / `Tab.strips` share the same polymorphic union and expand
 *   once via list comprehension into `EditorialModule` (Tabs | Hero | Product),
 *   so Tabs can nest recursively through Tab → strips → Tabs → …
 * - Duplicate expansion aliases are errors.
 * - `Page.menu` / `Page.footer`: singular expands (demo islands; island policy later).
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
  item,
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
const EditorialModuleId = scalarRef("EditorialModuleId");

const ModuleStrip = objectType(
  field("type", union(strLit("Tabs"), strLit("Hero"), strLit("Product"))),
  field("id", EditorialModuleId)
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
      defScalar("EditorialModuleId", "string"),
    ],
    resources: [
      resource(
        "Page",
        [field("id", PageId), field("locale", Locale)],
        objectType(
          field("id", PageId, true),
          field("title", prim("string")),
          field("menuId", MenuId),
          field("footerId", FooterId),
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
      resource(
        "EditorialModule",
        [field("id", EditorialModuleId), field("locale", Locale)],
        union(resourceRef("Tabs"), resourceRef("Hero"), resourceRef("Product"))
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
                "strips",
                construct("EditorialModule", [
                  arg("id", item("s", "id")),
                  arg("locale", ctx("locale")),
                ]),
                {
                  itemBinding: "s",
                  source: payload("p", "strips"),
                  filter: null,
                }
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
            ["id", "title"],
            [
              expand(
                "strips",
                construct("EditorialModule", [
                  arg("id", item("s", "id")),
                  arg("locale", ctx("locale")),
                ]),
                {
                  itemBinding: "s",
                  source: payload("tab", "strips"),
                  filter: null,
                }
              ),
            ]
          ),
          projection("Product", "prod", ["id", "sku", "title"]),
        ],
      }),
    ],
  };
}
