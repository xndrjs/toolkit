import { describe, expect, it } from "vitest";

import type { ContentField } from "../model/content-type";
import { fieldsForCodegen, isFieldIncludedInOutput } from "./filter-fields";

const activeField: ContentField = {
  id: "title",
  name: "Title",
  type: "Symbol",
  required: true,
  localized: false,
};

const omittedField: ContentField = {
  ...activeField,
  id: "legacySlug",
  omitted: true,
};

const disabledField: ContentField = {
  ...activeField,
  id: "deprecated",
  disabled: true,
};

const deletedField: ContentField = {
  ...activeField,
  id: "removed",
  deleted: true,
};

describe("filter-fields", () => {
  it("excludes omitted, disabled, and deleted fields by default", () => {
    const fields = [activeField, omittedField, disabledField, deletedField];

    expect(fieldsForCodegen(fields)).toEqual([activeField]);
    expect(isFieldIncludedInOutput(omittedField)).toBe(false);
    expect(isFieldIncludedInOutput(disabledField)).toBe(false);
    expect(isFieldIncludedInOutput(deletedField)).toBe(false);
  });

  it("includes blueprint fields when config flags are set", () => {
    const fields = [activeField, omittedField, disabledField, deletedField];

    expect(
      fieldsForCodegen(fields, {
        fields: {
          includeOmitted: true,
          includeDisabled: true,
          includeDeleted: true,
        },
      })
    ).toEqual(fields);
  });

  it("includes only the flagged blueprint field kinds", () => {
    const fields = [activeField, omittedField, disabledField];

    expect(fieldsForCodegen(fields, { fields: { includeOmitted: true } })).toEqual([
      activeField,
      omittedField,
    ]);
  });
});
