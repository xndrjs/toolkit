/**
 * Page-graph IR fixture: identity resources + Entry polymorphism via `when`.
 *
 * - `Page` is root-only; linked pages are shallow Entry `type: "Page"` arms.
 * - `Entry` payload is a closed discriminated object union (no rematerialize ARIs).
 * - `CustomReference` decode payload + query `resolve to` Entry | Asset.
 * - `SiteInternalLink` expands a target Entry without re-entering root Page strips.
 */
import type { Expr, Program } from "../compile";

import {
  arg,
  arrayOf,
  construct,
  defScalar,
  eq,
  expand,
  expandEach,
  field,
  identity,
  item,
  lit,
  objectType,
  or,
  param,
  payload,
  prim,
  projection,
  projectionArm,
  projectionWithArms,
  projectionWithResolve,
  query,
  resolveArm,
  resource,
  scalarRef,
  singleRoot,
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

function entryConstruct(sourceBinding: string, idExpr: Expr) {
  return construct("Entry", [
    arg("spaceId", identity(sourceBinding, "spaceId")),
    arg("environmentId", identity(sourceBinding, "environmentId")),
    arg("id", idExpr),
    arg("locale", identity(sourceBinding, "locale")),
  ]);
}

function stripsEach(sourceBinding: string, sourceField: string, itemBinding: string) {
  return expandEach("strips", itemBinding, payload(sourceBinding, sourceField), [
    {
      target: entryConstruct(sourceBinding, item(itemBinding, "id")),
      when: null,
    },
  ]);
}

function assetExpand(alias: string, binding: string, idField: string) {
  return expand(
    alias,
    construct("Asset", [
      arg("spaceId", identity(binding, "spaceId")),
      arg("environmentId", identity(binding, "environmentId")),
      arg("id", payload(binding, idField)),
      arg("locale", identity(binding, "locale")),
    ])
  );
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
    opaques: [],
    resources: [
      resource(
        "Entry",
        entryIdentity(),
        union(
          objectType(
            field("type", strLit("Hero")),
            field("id", EntryId, true),
            field("title", prim("string")),
            field("imageId", AssetId)
          ),
          objectType(
            field("type", strLit("Tabs")),
            field("id", EntryId, true),
            field("title", prim("string")),
            field("tabs", arrayOf(CmsLink))
          ),
          objectType(
            field("type", strLit("Tab")),
            field("id", EntryId, true),
            field("title", prim("string")),
            field("strips", arrayOf(CmsLink))
          ),
          objectType(
            field("type", strLit("Product")),
            field("id", EntryId, true),
            field("sku", Sku),
            field("title", prim("string"))
          ),
          objectType(
            field("type", strLit("Menu")),
            field("id", EntryId, true),
            field("title", prim("string")),
            field("logoId", AssetId)
          ),
          objectType(
            field("type", strLit("Footer")),
            field("id", EntryId, true),
            field("title", prim("string")),
            field("logoId", AssetId)
          ),
          objectType(
            field("type", strLit("Page")),
            field("id", EntryId, true),
            field("title", prim("string"))
          ),
          objectType(
            field("type", strLit("SiteInternalLink")),
            field("id", EntryId, true),
            field("targetId", EntryId)
          )
        )
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
        union(
          objectType(
            field("type", strLit("Entry")),
            field("spaceId", SpaceId),
            field("environmentId", EnvironmentId),
            field("id", EntryId)
          ),
          objectType(
            field("type", strLit("Asset")),
            field("spaceId", SpaceId),
            field("environmentId", EnvironmentId),
            field("id", AssetId)
          )
        )
      ),
      resource(
        "Page",
        entryIdentity(),
        objectType(
          field("id", EntryId, true),
          field("title", prim("string")),
          field("menuId", EntryId, false, [
            {
              resource: "Entry",
              fields: [{ name: "type", values: ["Menu"], span }],
              span,
            },
          ]),
          field("footerId", EntryId, false, [
            {
              resource: "Entry",
              fields: [{ name: "type", values: ["Footer"], span }],
              span,
            },
          ]),
          field("strips", arrayOf(CmsLink), false, [
            {
              resource: "Entry",
              fields: [],
              span,
            },
          ]),
          field("related", arrayOf(CustomReferenceValue), false, [
            {
              resource: "CustomReference",
              fields: [],
              span,
            },
          ])
        )
      ),
    ],
    fragments: [],
    datasources: [],
    queries: [
      query("PageDetail", {
        parameters: [
          field("pageId", EntryId),
          field("spaceId", SpaceId),
          field("environmentId", EnvironmentId),
          field("locale", Locale),
        ],
        contextProjections: [
          { contextName: "spaceId", paramName: "spaceId", span },
          { contextName: "environmentId", paramName: "environmentId", span },
          { contextName: "locale", paramName: "locale", span },
        ],
        roots: singleRoot(
          construct("Page", [
            arg("spaceId", param("spaceId")),
            arg("environmentId", param("environmentId")),
            arg("id", param("pageId")),
            arg("locale", param("locale")),
          ])
        ),
        projections: [
          projection(
            "Page",
            "p",
            [],
            [
              expand("menu", entryConstruct("p", payload("p", "menuId"))),
              expand("footer", entryConstruct("p", payload("p", "footerId"))),
              stripsEach("p", "strips", "pageLink"),
              expandEach("related", "ref", payload("p", "related"), [
                {
                  target: construct("CustomReference", [
                    arg("ref", item("ref")),
                    arg("locale", identity("p", "locale")),
                  ]),
                  when: null,
                },
              ]),
            ],
            null,
            "properties"
          ),
          projectionWithResolve("CustomReference", "c", [
            resolveArm(
              construct("Entry", [
                arg("spaceId", payload("c", "spaceId")),
                arg("environmentId", payload("c", "environmentId")),
                arg("id", payload("c", "id")),
                arg("locale", identity("c", "locale")),
              ]),
              eq(payload("c", "type"), lit("Entry"))
            ),
            resolveArm(
              construct("Asset", [
                arg("spaceId", payload("c", "spaceId")),
                arg("environmentId", payload("c", "environmentId")),
                arg("id", payload("c", "id")),
                arg("locale", identity("c", "locale")),
              ]),
              eq(payload("c", "type"), lit("Asset"))
            ),
          ]),
          projectionWithArms("Entry", "e", [
            projectionArm(
              eq(payload("e", "type"), lit("Hero")),
              [],
              [assetExpand("image", "e", "imageId")],
              "properties"
            ),
            projectionArm(
              eq(payload("e", "type"), lit("Tabs")),
              [],
              [
                expandEach("tabs", "tabLink", payload("e", "tabs"), [
                  {
                    target: entryConstruct("e", item("tabLink", "id")),
                    when: null,
                  },
                ]),
              ],
              "properties"
            ),
            projectionArm(
              eq(payload("e", "type"), lit("Tab")),
              [],
              [stripsEach("e", "strips", "entryLink")],
              "properties"
            ),
            projectionArm(
              eq(payload("e", "type"), lit("Menu")),
              [],
              [assetExpand("logo", "e", "logoId")],
              "properties"
            ),
            projectionArm(
              eq(payload("e", "type"), lit("Footer")),
              [],
              [assetExpand("logo", "e", "logoId")],
              "properties"
            ),
            projectionArm(
              eq(payload("e", "type"), lit("SiteInternalLink")),
              [],
              [expand("target", entryConstruct("e", payload("e", "targetId")))],
              "properties"
            ),
          ]),
          projection("Asset", "a", [], [], null, "properties"),
        ],
        islands: [
          {
            resource: "Entry",
            binding: "e",
            when: or(
              eq(payload("e", "type"), lit("Menu")),
              eq(payload("e", "type"), lit("Footer"))
            ),
            span: null,
          },
        ],
      }),
    ],
  };
}
