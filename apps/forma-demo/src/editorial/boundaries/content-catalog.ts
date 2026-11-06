import { boundary } from "@xndrjs/forma";

export type PublishedPage = {
  readonly pageId: string;
  readonly lastModifiedAt: string;
};

export const ContentCatalog = boundary("content-catalog");

export const EnumeratePublishedPages = ContentCatalog.intent("enumeratePublishedPages").contract<
  void,
  readonly PublishedPage[],
  never
>();
