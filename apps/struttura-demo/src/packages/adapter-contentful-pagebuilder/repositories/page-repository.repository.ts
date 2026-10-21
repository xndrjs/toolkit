import type { Page } from "@core/pagebuilder/models";

export type PageRepositoryRepositoryDeps = {
  // TODO: loaders, mappers, and other adapters this repository composes
};

export class PageRepositoryRepository {
  constructor(private readonly deps: PageRepositoryRepositoryDeps) {
    void this.deps;
  }

  async getPageById(_id: string): Promise<Page | null> {
    throw new Error("Not implemented: PageRepositoryRepository.getPageById");
  }
}
