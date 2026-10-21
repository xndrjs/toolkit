export class PageNotFoundError extends Error {
  readonly code = "PAGE_NOT_FOUND" as const;

  constructor(message = "PageNotFound") {
    super(message);
    this.name = "PageNotFoundError";
  }
}
