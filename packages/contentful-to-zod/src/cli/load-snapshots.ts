import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { ContentTypeProps, LocaleProps } from "contentful-management";

import { mapContentTypeFromCma, mapLocaleFromCma } from "../client/map-from-cma";
import type { ContentType } from "../model/content-type";
import type { Locale } from "../model/locale";

function isCmaContentType(item: unknown): item is ContentTypeProps {
  return (
    typeof item === "object" &&
    item !== null &&
    "sys" in item &&
    typeof (item as ContentTypeProps).sys?.id === "string" &&
    Array.isArray((item as ContentTypeProps).fields)
  );
}

function isCmaLocale(item: unknown): item is LocaleProps {
  return (
    typeof item === "object" &&
    item !== null &&
    "code" in item &&
    typeof (item as LocaleProps).code === "string" &&
    "default" in item
  );
}

function isNormalizedContentType(item: unknown): item is ContentType {
  return (
    typeof item === "object" &&
    item !== null &&
    "id" in item &&
    typeof (item as ContentType).id === "string" &&
    Array.isArray((item as ContentType).fields) &&
    !("sys" in item)
  );
}

function isNormalizedLocale(item: unknown): item is Locale {
  return (
    typeof item === "object" &&
    item !== null &&
    "code" in item &&
    typeof (item as Locale).code === "string" &&
    typeof (item as Locale).default === "boolean"
  );
}

function mapContentTypesFromSnapshot(data: unknown): ContentType[] {
  if (!Array.isArray(data)) {
    throw new Error("Content types snapshot must be a JSON array.");
  }

  if (data.length === 0) {
    return [];
  }

  if (isCmaContentType(data[0])) {
    return (data as ContentTypeProps[]).map((item) => mapContentTypeFromCma(item));
  }

  if (isNormalizedContentType(data[0])) {
    return data as ContentType[];
  }

  throw new Error(
    "Content types snapshot entries must be normalized content types or raw CMA ContentTypeProps."
  );
}

function mapLocalesFromSnapshot(data: unknown): Locale[] {
  if (!Array.isArray(data)) {
    throw new Error("Locales snapshot must be a JSON array.");
  }

  if (data.length === 0) {
    return [];
  }

  const first = data[0];
  if (typeof first === "object" && first !== null && "sys" in first && isCmaLocale(first)) {
    return (data as LocaleProps[]).map((item) => mapLocaleFromCma(item));
  }

  if (isNormalizedLocale(first)) {
    return data as Locale[];
  }

  throw new Error("Locales snapshot entries must be normalized locales or raw CMA LocaleProps.");
}

export async function readContentTypesSnapshot(path: string): Promise<ContentType[]> {
  const raw = await readFile(path, "utf8");
  return mapContentTypesFromSnapshot(JSON.parse(raw) as unknown);
}

export async function readLocalesSnapshot(path: string): Promise<Locale[]> {
  const raw = await readFile(path, "utf8");
  return mapLocalesFromSnapshot(JSON.parse(raw) as unknown);
}

export async function writeContentTypesSnapshot(
  path: string,
  contentTypes: ContentType[]
): Promise<void> {
  await writeFile(path, `${JSON.stringify(contentTypes, null, 2)}\n`, "utf8");
}

export async function writeLocalesSnapshot(path: string, locales: Locale[]): Promise<void> {
  await writeFile(path, `${JSON.stringify(locales, null, 2)}\n`, "utf8");
}

export async function ensureParentDir(filePath: string): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dirname(filePath), { recursive: true });
}
