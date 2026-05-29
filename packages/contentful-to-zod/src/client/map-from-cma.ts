import type {
  ContentFields,
  ContentTypeFieldValidation,
  ContentTypeProps,
  LocaleProps,
} from "contentful-management";

import type {
  ContentField,
  ContentFieldItem,
  ContentFieldValidation,
  ContentType,
} from "../model/content-type";
import type { Locale } from "../model/locale";

function mapFieldValidation(validation: ContentTypeFieldValidation): ContentFieldValidation {
  return validation as ContentFieldValidation;
}

function mapFieldItem(
  field: Pick<ContentFields, "type" | "linkType" | "validations">
): ContentFieldItem {
  const item: ContentFieldItem = {
    type: field.type,
  };

  if (field.linkType !== undefined) {
    item.linkType = field.linkType;
  }

  if (field.validations !== undefined) {
    item.validations = field.validations.map(mapFieldValidation);
  }

  return item;
}

function mapContentField(field: ContentFields): ContentField {
  const mapped: ContentField = {
    ...mapFieldItem(field),
    id: field.id,
    name: field.name,
    required: field.required,
    localized: field.localized,
  };

  if (field.disabled !== undefined) {
    mapped.disabled = field.disabled;
  }
  if (field.omitted !== undefined) {
    mapped.omitted = field.omitted;
  }
  if (field.deleted !== undefined) {
    mapped.deleted = field.deleted;
  }
  if (field.items !== undefined) {
    mapped.items = mapFieldItem(field.items);
  }
  if (field.allowedResources !== undefined) {
    mapped.allowedResources = field.allowedResources;
  }

  return mapped;
}

/** Map raw CMA `ContentTypeProps` to the normalized codegen model. */
export function mapContentTypeFromCma(props: ContentTypeProps): ContentType {
  const contentType: ContentType = {
    id: props.sys.id,
    name: props.name,
    fields: props.fields.map(mapContentField),
  };

  if (props.description) {
    contentType.description = props.description;
  }
  if (props.displayField) {
    contentType.displayField = props.displayField;
  }

  return contentType;
}

/** Map raw CMA `LocaleProps` to the normalized codegen model. */
export function mapLocaleFromCma(props: LocaleProps): Locale {
  const locale: Locale = {
    code: props.code,
    default: props.default,
  };

  if (props.fallbackCode !== undefined) {
    locale.fallbackCode = props.fallbackCode;
  }

  return locale;
}
