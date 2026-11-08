import { boundary } from "@xndrjs/forma";

export type ResolvedPath = {
  readonly pageId: string;
  readonly canonicalPath: string;
};
export type ResolvePathsInput = { readonly pageIds: readonly string[] };
export type ResolvePathsError = {
  readonly code: "route_not_found";
  readonly pageId: string;
};

export const Routing = boundary("routing");

export const ResolvePaths = Routing.intent("resolvePaths").contract<
  ResolvePathsInput,
  readonly ResolvedPath[],
  ResolvePathsError
>();
