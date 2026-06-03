import type { ContentfulToZodConfig } from "../config/define-config";
import type {
  ContentField,
  ContentFieldItem,
  ContentFieldValidation,
  ContentType,
} from "../model/content-type";
import { fieldsForCodegen } from "./filter-fields";

/** A parent content-type field that links to entries with CMA `linkContentType` validation. */
export interface LinkFieldTarget {
  parentContentTypeId: string;
  fieldId: string;
  targetContentTypeIds: readonly string[];
}

/** Read `linkContentType` from CMA field validations (first occurrence). */
export function linkContentTypeFromValidations(
  validations: ContentFieldValidation[] | undefined
): string[] | undefined {
  for (const validation of validations ?? []) {
    const targets = validation.linkContentType;
    if (targets !== undefined && targets.length > 0) {
      return targets;
    }
  }
  return undefined;
}

function isEntryLinkItem(item: ContentFieldItem): boolean {
  return item.type === "Link" && item.linkType === "Entry";
}

function linkTargetsForField(field: ContentField): string[] | undefined {
  if (isEntryLinkItem(field)) {
    return linkContentTypeFromValidations(field.validations);
  }

  if (field.type === "Array" && field.items !== undefined && isEntryLinkItem(field.items)) {
    return linkContentTypeFromValidations(field.validations);
  }

  return undefined;
}

/** Collect entry link fields that declare `linkContentType` in the content model. */
export function collectLinkFieldTargets(
  contentTypes: ContentType[],
  config?: ContentfulToZodConfig | undefined
): LinkFieldTarget[] {
  const targets: LinkFieldTarget[] = [];

  for (const contentType of contentTypes) {
    for (const field of fieldsForCodegen(contentType.fields, config)) {
      const targetIds = linkTargetsForField(field);
      if (targetIds === undefined) {
        continue;
      }

      targets.push({
        parentContentTypeId: contentType.id,
        fieldId: field.id,
        targetContentTypeIds: targetIds,
      });
    }
  }

  return targets;
}

/** Fail fast when `linkContentType` references a content type missing from the snapshot. */
export function validateLinkFieldTargets(
  targets: LinkFieldTarget[],
  availableContentTypeIds: ReadonlySet<string>
): void {
  for (const target of targets) {
    for (const id of target.targetContentTypeIds) {
      if (!availableContentTypeIds.has(id)) {
        throw new Error(
          `Link field "${target.parentContentTypeId}.${target.fieldId}" references content type "${id}", which is not in the codegen snapshot. Add it to the snapshot or remove the validation.`
        );
      }
    }
  }
}
