/**
 * Loader "page"
 *
 * Fetches raw Page records from an external service.
 * Knows only the infrastructural shape — no @core/* types.
 */
export type RawPage = {
  // TODO: vendor-specific fields
};

export type PageLoaderDeps = {
  // client: VendorClient;
};

export class PageLoader {
  constructor(private readonly deps: PageLoaderDeps) {}

  async get(id: string): Promise<RawPage | null> {
    throw new Error("Not implemented: PageLoader.get");
  }

  async getMany(ids: string[]): Promise<RawPage[]> {
    throw new Error("Not implemented: PageLoader.getMany");
  }
}
