import type { Page } from "@core/pagebuilder/models";
import type { RawPage } from "@infrastructure/contentful";

export function mapRawToPage(raw: RawPage): Page {
  void raw;
  throw new Error("Not implemented: mapRawToPage");
}
