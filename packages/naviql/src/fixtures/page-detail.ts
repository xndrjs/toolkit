/**
 * Page-graph IR fixture: CMS Entry links + CustomReference indirection.
 *
 * - `Page.strips` / `Tab.strips` are `{ id: EntryId }[]` (no content-type discriminant).
 * - Strips expand via `each` into generic `Entry(...)`; concrete type emerges at load.
 * - `CustomReference` is an alternate locator that rematerializes to `Entry` or `Asset`.
 */
import type { Program } from "../compile";

import {
  arg,
  arrayOf,
  construct,
  ctx,
  defScalar,
  expand,
  expandEach,
  field,
  identity,
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
const SpaceId = scalarRef("SpaceId");
const EnvironmentId = scalarRef("EnvironmentId");
const EntryId = scalarRef("EntryId");
const AssetId = scalarRef("AssetId");
const CustomReferenceValue = scalarRef("CustomReferenceValue");
const Sku = scalarRef("Sku");

const entryIdentity = () => [
  field("spaceId", SpaceId),
  field("environmentId", EnvironmentId),
  field("id", EntryId),
  field("locale", Locale),
];

const assetIdentity = () => [
  field("spaceId", SpaceId),
  field("environmentId", EnvironmentId),
  field("id", AssetId),
  field("locale", Locale),
];

const CmsLink = objectType(field("id", EntryId));

function stripsEach(sourceBinding: string, sourceField: string) {
  return expandEach("strips", "link", payload(sourceBinding, sourceField), [
    {
      target: construct("Entry", [
        arg("spaceId", identity(sourceBinding, "spaceId")),
        arg("environmentId", identity(sourceBinding, "environmentId")),
        arg("id", item("link", "id")),
        arg("locale", identity(sourceBinding, "locale")),
      ]),
      when: null,
    },
  ]);
}

export function pageDetailProgram(): Program {
  return {
    span,
    scalars: [
      defScalar("Locale", "string"),
      defScalar("SpaceId", "string"),
      defScalar("EnvironmentId", "string"),
      defScalar("EntryId", "string"),
      defScalar("AssetId", "string"),
      defScalar("CustomReferenceValue", "string"),
      defScalar("Sku", "string"),
    ],
    resources: [
      resource(
        "Entry",
        entryIdentity(),
        union(resourceRef("Hero"), resourceRef("Tabs"), resourceRef("Product"))
      ),
      resource(
        "Asset",
        assetIdentity(),
        objectType(
          field("type", strLit("Asset")),
          field("id", AssetId, true),
          field("url", prim("string")),
          field("title", prim("string")),
          field("kind", union(strLit("image"), strLit("video"), strLit("document")))
        )
      ),
      resource(
        "CustomReference",
        [field("ref", CustomReferenceValue), field("locale", Locale)],
        union(resourceRef("Entry"), resourceRef("Asset"))
      ),
      resource(
        "Page",
        entryIdentity(),
        objectType(
          field("id", EntryId, true),
          field("title", prim("string")),
          field("menuId", EntryId),
          field("footerId", EntryId),
          field("strips", arrayOf(CmsLink)),
          field("related", arrayOf(CustomReferenceValue))
        )
      ),
      resource(
        "Hero",
        entryIdentity(),
        objectType(
          field("type", strLit("Hero")),
          field("id", EntryId, true),
          field("title", prim("string")),
          field("imageId", AssetId)
        )
      ),
      resource(
        "Menu",
        entryIdentity(),
        objectType(
          field("id", EntryId, true),
          field("title", prim("string")),
          field("logoId", AssetId)
        )
      ),
      resource(
        "Footer",
        entryIdentity(),
        objectType(
          field("id", EntryId, true),
          field("title", prim("string")),
          field("logoId", AssetId)
        )
      ),
      resource(
        "Tabs",
        entryIdentity(),
        objectType(
          field("type", strLit("Tabs")),
          field("id", EntryId, true),
          field("title", prim("string")),
          field("tabs", arrayOf(CmsLink))
        )
      ),
      resource(
        "Tab",
        entryIdentity(),
        objectType(
          field("id", EntryId, true),
          field("title", prim("string")),
          field("strips", arrayOf(CmsLink))
        )
      ),
      resource(
        "Product",
        entryIdentity(),
        objectType(
          field("type", strLit("Product")),
          field("id", EntryId, true),
          field("sku", Sku),
          field("title", prim("string"))
        )
      ),
    ],
    queries: [
      query("PageDetail", {
        parameters: [field("pageId", EntryId)],
        context: [
          field("spaceId", SpaceId),
          field("environmentId", EnvironmentId),
          field("locale", Locale),
        ],
        root: construct("Page", [
          arg("spaceId", ctx("spaceId")),
          arg("environmentId", ctx("environmentId")),
          arg("id", param("pageId")),
          arg("locale", ctx("locale")),
        ]),
        projections: [
          projection(
            "Page",
            "p",
            ["id", "title"],
            [
              expand(
                "menu",
                construct("Menu", [
                  arg("spaceId", identity("p", "spaceId")),
                  arg("environmentId", identity("p", "environmentId")),
                  arg("id", payload("p", "menuId")),
                  arg("locale", identity("p", "locale")),
                ])
              ),
              expand(
                "footer",
                construct("Footer", [
                  arg("spaceId", identity("p", "spaceId")),
                  arg("environmentId", identity("p", "environmentId")),
                  arg("id", payload("p", "footerId")),
                  arg("locale", identity("p", "locale")),
                ])
              ),
              stripsEach("p", "strips"),
              expandEach("related", "ref", payload("p", "related"), [
                {
                  target: construct("CustomReference", [
                    arg("ref", item("ref")),
                    arg("locale", identity("p", "locale")),
                  ]),
                  when: null,
                },
              ]),
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
                  arg("spaceId", ctx("spaceId")),
                  arg("environmentId", ctx("environmentId")),
                  arg("id", payload("h", "imageId")),
                  arg("locale", identity("h", "locale")),
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
                  arg("spaceId", ctx("spaceId")),
                  arg("environmentId", ctx("environmentId")),
                  arg("id", payload("m", "logoId")),
                  arg("locale", identity("m", "locale")),
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
                  arg("spaceId", ctx("spaceId")),
                  arg("environmentId", ctx("environmentId")),
                  arg("id", payload("f", "logoId")),
                  arg("locale", identity("f", "locale")),
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
              expandEach("tabs", "link", payload("t", "tabs"), [
                {
                  target: construct("Tab", [
                    arg("spaceId", identity("t", "spaceId")),
                    arg("environmentId", identity("t", "environmentId")),
                    arg("id", item("link", "id")),
                    arg("locale", identity("t", "locale")),
                  ]),
                  when: null,
                },
              ]),
            ]
          ),
          projection("Tab", "tab", ["id", "title"], [stripsEach("tab", "strips")]),
          projection("Product", "prod", ["id", "sku", "title"]),
        ],
      }),
    ],
  };
}
