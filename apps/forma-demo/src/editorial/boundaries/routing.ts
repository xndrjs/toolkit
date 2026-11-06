import { boundary } from "@xndrjs/forma";

export type RoutePath = { readonly path: string };
export type RouteMatch = {
  readonly pageId: string;
  readonly canonicalPath: string;
};
export type ResolvedPath = {
  readonly pageId: string;
  readonly canonicalPath: string;
};
export type RouteError = { readonly code: "route_not_found" };
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

export const ResolvePath = Routing.intent("resolvePath").contract<
  RoutePath,
  RouteMatch,
  RouteError
>();
