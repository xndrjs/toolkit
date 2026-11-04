import { boundary } from "@xndrjs/forma";

export type RoutePath = { readonly path: string };
export type RouteMatch = {
  readonly pageId: string;
  readonly canonicalPath: string;
};
export type RouteError = { readonly code: "route_not_found" };

export const Routing = boundary("routing");

/** Shared capability extracted from Sitemap when PageBuilder also needed it. */
export const ResolvePath = Routing.intent("resolvePath").contract<
  RoutePath,
  RouteMatch,
  RouteError
>();
