import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ContentType } from "../model/content-type";
import type { Locale } from "../model/locale";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures");

export function loadFixtureContentTypes(): ContentType[] {
  return JSON.parse(readFileSync(join(fixturesDir, "content-types.json"), "utf8")) as ContentType[];
}

export function loadFixtureLocales(): Locale[] {
  return JSON.parse(readFileSync(join(fixturesDir, "locales.json"), "utf8")) as Locale[];
}
