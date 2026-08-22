import { describe, expect, it } from "vitest";

import type { ContentType } from "../model/content-type";
import {
  collectLinkFields,
  collectLinkFieldTargets,
  linkContentTypeFromValidations,
  validateLinkFieldTargets,
} from "./link-fields";

describe("linkContentTypeFromValidations", () => {
  it("returns linkContentType when present", () => {
    expect(linkContentTypeFromValidations([{ linkContentType: ["author", "category"] }])).toEqual([
      "author",
      "category",
    ]);
  });

  it("returns undefined when absent", () => {
    expect(linkContentTypeFromValidations([{ size: { max: 10 } }])).toBeUndefined();
  });
});

describe("collectLinkFieldTargets", () => {
  const blogPost: ContentType = {
    id: "blogPost",
    name: "Blog Post",
    fields: [
      {
        id: "author",
        name: "Author",
        type: "Link",
        linkType: "Entry",
        required: false,
        localized: false,
        validations: [{ linkContentType: ["author"] }],
      },
      {
        id: "related",
        name: "Related",
        type: "Array",
        required: false,
        localized: false,
        items: { type: "Link", linkType: "Entry" },
        validations: [{ linkContentType: ["blogPost", "author"] }],
      },
      {
        id: "slug",
        name: "Slug",
        type: "Symbol",
        required: true,
        localized: false,
      },
    ],
  };

  it("collects Entry link and Array-of-Entry link fields with linkContentType", () => {
    expect(collectLinkFieldTargets([blogPost])).toEqual([
      {
        parentContentTypeId: "blogPost",
        fieldId: "author",
        targetContentTypeIds: ["author"],
      },
      {
        parentContentTypeId: "blogPost",
        fieldId: "related",
        targetContentTypeIds: ["blogPost", "author"],
      },
    ]);
  });
});

describe("collectLinkFields", () => {
  const snapshot: ContentType[] = [
    {
      id: "page",
      name: "Page",
      fields: [
        {
          id: "modules",
          name: "Modules",
          type: "Array",
          required: false,
          localized: false,
          items: { type: "Link", linkType: "Entry" },
          validations: [{ linkContentType: ["tabs"] }],
        },
        {
          id: "menu",
          name: "Menu",
          type: "Link",
          linkType: "Entry",
          required: false,
          localized: false,
          validations: [{ linkContentType: ["menu"] }],
        },
      ],
    },
    {
      id: "hero",
      name: "Hero",
      fields: [
        {
          id: "image",
          name: "Image",
          type: "Link",
          linkType: "Asset",
          required: true,
          localized: false,
        },
      ],
    },
    {
      id: "product",
      name: "Product",
      fields: [
        {
          id: "sku",
          name: "SKU",
          type: "Symbol",
          required: true,
          localized: false,
        },
      ],
    },
  ];

  it("collects Entry and Asset link fields regardless of linkContentType", () => {
    expect(collectLinkFields(snapshot)).toEqual([
      {
        parentContentTypeId: "page",
        fieldId: "modules",
        linkType: "Entry",
        cardinality: "many",
      },
      {
        parentContentTypeId: "page",
        fieldId: "menu",
        linkType: "Entry",
        cardinality: "one",
      },
      {
        parentContentTypeId: "hero",
        fieldId: "image",
        linkType: "Asset",
        cardinality: "one",
      },
    ]);
  });
});

describe("validateLinkFieldTargets", () => {
  it("throws when a target content type is missing from the snapshot", () => {
    expect(() =>
      validateLinkFieldTargets(
        [
          {
            parentContentTypeId: "blogPost",
            fieldId: "author",
            targetContentTypeIds: ["missing"],
          },
        ],
        new Set(["blogPost"])
      )
    ).toThrow('references content type "missing"');
  });
});
