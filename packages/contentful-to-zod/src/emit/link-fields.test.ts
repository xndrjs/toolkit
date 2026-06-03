import { describe, expect, it } from "vitest";

import type { ContentType } from "../model/content-type";
import {
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
