import { defineRouteMiddleware } from "@astrojs/starlight/route-data";
import { isBlogAreaRoute, isBlogIndexRoute } from "./utils/blog-posts";

export const onRequest = defineRouteMiddleware(async (context, next) => {
  await next();

  const route = context.locals.starlightRoute;

  if (!isBlogAreaRoute(route.id)) return;

  route.hasSidebar = false;

  if (isBlogIndexRoute(route.id)) {
    route.toc = undefined;
  }
});
