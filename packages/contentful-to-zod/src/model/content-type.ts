/** Contentful CMA field types referenced in content model definitions. */
export type ContentfulFieldType =
  | "Symbol"
  | "Text"
  | "Integer"
  | "Number"
  | "Boolean"
  | "Date"
  | "Location"
  | "Object"
  | "Link"
  | "Array"
  | "RichText"
  | "ResourceLink";

export type ContentfulLinkType = "Entry" | "Asset";

export interface NumRange {
  min?: number;
  max?: number;
}

export interface DateRange {
  min?: string;
  max?: string;
}

export interface RegExpValidation {
  pattern: string;
  flags?: string;
}

/** Subset of CMA field validations used for Zod mapping. */
export interface ContentFieldValidation {
  linkContentType?: string[];
  in?: (string | number)[];
  linkMimetypeGroup?: string[];
  enabledNodeTypes?: string[];
  enabledMarks?: string[];
  unique?: boolean;
  size?: NumRange;
  range?: NumRange;
  dateRange?: DateRange;
  regexp?: RegExpValidation;
  prohibitRegexp?: RegExpValidation;
  message?: string | null;
  assetImageDimensions?: {
    width?: NumRange;
    height?: NumRange;
  };
  assetFileSize?: NumRange;
  nodes?: Record<string, unknown>;
}

/** Array item or nested link shape (`items` on Array fields). */
export interface ContentFieldItem {
  type: ContentfulFieldType | (string & {});
  linkType?: ContentfulLinkType | (string & {});
  validations?: ContentFieldValidation[];
}

/** Single field on a Contentful content type (CMA blueprint). */
export interface ContentField extends ContentFieldItem {
  id: string;
  name: string;
  required: boolean;
  localized: boolean;
  disabled?: boolean;
  omitted?: boolean;
  deleted?: boolean;
  items?: ContentFieldItem;
  allowedResources?: unknown[];
}

/** Normalized Contentful content type for codegen (sys stripped to `id`). */
export interface ContentType {
  id: string;
  name: string;
  description?: string;
  displayField?: string;
  fields: ContentField[];
}
