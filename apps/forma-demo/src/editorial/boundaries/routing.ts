import { boundary } from "@xndrjs/forma";

export type ResolvedPath = {
  readonly pageId: string;
  readonly canonicalPath: string;
};
export type ResolvePathsInput = { readonly pageIds: readonly string[] };
export type ResolvePathsResult = {
  readonly resolved: readonly ResolvedPath[];
  readonly unresolvedPageIds: readonly string[];
};

export const Routing = boundary("routing");

export const ResolvePaths = Routing.intent("resolvePaths").contract<
  ResolvePathsInput,
  ResolvePathsResult,
  never
>();
