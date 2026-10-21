import type { Page } from "@core/pagebuilder/models";
import type { PageRepositoryPort } from "@core/pagebuilder/ports";
import { PageLoader } from "@infrastructure/contentful";

import { mapRawToPage } from "../mappers/page.mapper";

export type PageRepositoryRepositoryDeps = {
  pageLoader: PageLoader;
};

export class PageRepositoryRepository implements PageRepositoryPort {
  constructor(private readonly deps: PageRepositoryRepositoryDeps) {}

  async getPageById(id: string): Promise<Page | null> {
    const raw = await this.deps.pageLoader.get(id);
    return raw ? mapRawToPage(raw) : null;
  }
}
