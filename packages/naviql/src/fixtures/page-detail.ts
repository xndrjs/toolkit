/**
 * Page-graph IR fixture inspired by the resource-graph-resolver demo.
 *
 * - `Page.strips` / `Tab.strips` are discriminated stubs (`Hero` / `Tabs` / `Product`).
 * - Strips expand via polymorphic `each` into concrete resource ARIs.
 */
import type { Program } from "../compile";

import {
  arg,
  arrayOf,
  construct,
  ctx,
  defScalar,
  eq,
  expand,
  expandEach,
  field,
  item,
  lit,
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
  objectType(field("type", strLit("Hero")), field("id", HeroId)),
  objectType(field("type", strLit("Tabs")), field("id", TabsId)),
  objectType(field("type", strLit("Product")), field("id", ProductId))
);

function stripsEach(sourceBinding: string, sourceField: string) {
  return expandEach("strips", "s", payload(sourceBinding, sourceField), [
    {
      target: construct("Hero", [arg("id", item("s", "id")), arg("locale", ctx("locale"))]),
      when: eq(item("s", "type"), lit("Hero")),
    },
    {
      target: construct("Tabs", [arg("id", item("s", "id")), arg("locale", ctx("locale"))]),
      when: eq(item("s", "type"), lit("Tabs")),
    },
    {
      target: construct("Product", [arg("id", item("s", "id")), arg("locale", ctx("locale"))]),
      when: eq(item("s", "type"), lit("Product")),
    },
  ]);
}

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
          field("menuId", MenuId),
          field("footerId", FooterId),
          field("strips", arrayOf(ModuleStrip))
        )
      ),
      resource(
        "Hero",
        [field("id", HeroId), field("locale", Locale)],
        objectType(
          field("type", strLit("Hero")),
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
        objectType(
          field("type", strLit("Tabs")),
          field("id", TabsId, true),
          field("title", prim("string"))
        )
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
        objectType(
          field("type", strLit("Product")),
          field("id", ProductId, true),
          field("sku", Sku),
          field("title", prim("string"))
        )
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
              stripsEach("p", "strips"),
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
          projection("Tab", "tab", ["id", "title"], [stripsEach("tab", "strips")]),
          projection("Product", "prod", ["id", "sku", "title"]),
        ],
      }),
    ],
  };
}
